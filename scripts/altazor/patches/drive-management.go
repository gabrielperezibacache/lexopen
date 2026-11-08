package orchestrator

import (
 "context"
 "crypto/rand"
 "crypto/sha256"
 "encoding/base64"
 "encoding/hex"
 "encoding/json"
 "io"
 "mime"
 "net/http"
 "net/url"
 "regexp"
 "strconv"
 "strings"
 "time"
 "unicode"
 "unicode/utf8"
 "github.com/madkoding/kitties/internal/oauth"
)
const LexOpenDriveManageScope="https://www.googleapis.com/auth/drive"
const lexopenDriveReadScope="https://www.googleapis.com/auth/drive.readonly"
const lexopenDriveMetadataScope="https://www.googleapis.com/auth/drive.metadata.readonly"
const lexopenDriveMaxRead=25<<20
const lexopenDriveMaxWrite=4<<20
var lexopenDriveAlias=regexp.MustCompile(`^altazor-google-[a-f0-9]{16}$`)
var lexopenDriveID=regexp.MustCompile(`^[A-Za-z0-9_-]{1,200}$`)
var lexopenDriveHex=regexp.MustCompile(`^[a-f0-9]{64}$`)
var lexopenDriveRequestID=regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)
var lexopenDriveVersion=regexp.MustCompile(`^[0-9]{1,30}$`)
var lexopenDriveHTTPDo=(&http.Client{Timeout:30*time.Second,CheckRedirect:func(*http.Request,[]*http.Request)error{return http.ErrUseLastResponse}}).Do

type DriveError struct{Status int;Code string}
func(e *DriveError)Error()string{return e.Code}
func driveErr(status int,code string)error{return &DriveError{status,code}}
func driveText(s string,max int,required bool)bool{return (!required||strings.TrimSpace(s)!="")&&len(s)<=max&&utf8.ValidString(s)&&!strings.ContainsFunc(s,unicode.IsControl)}
func lexopenDriveNewRevision()(string,error){b:=make([]byte,16);if _,e:=rand.Read(b);e!=nil{return "",driveErr(503,"drive_unavailable")};return hex.EncodeToString(b),nil}
type DriveStatus struct{AccountSubjectHash string `json:"account_subject_hash"`;Alias string `json:"alias"`;Access string `json:"access"`;CanReadFiles bool `json:"can_read_files"`;CanManageFiles bool `json:"can_manage_files"`;AccountRevision string `json:"account_revision"`;Scopes []string `json:"scopes"`}
func(m *Manager)LexOpenDriveStatus(alias string)(DriveStatus,error){
 if !lexopenDriveAlias.MatchString(alias){return DriveStatus{},driveErr(400,"drive_request_invalid")};app,e:=m.OAuthApp(alias);if e!=nil||app.Provider!="google"||app.Kind!="google-workspace"||app.Settings["oauth_lexopen_persistent"]!="v1"{return DriveStatus{},driveErr(404,"drive_account_unavailable")};subject:=app.Settings["oauth_account"];if !driveText(subject,200,true){return DriveStatus{},driveErr(409,"oauth_reconnect_required")};subjectSum:=sha256.Sum256([]byte(subject));scope:=app.Settings["oauth_scopes"];status:=DriveStatus{AccountSubjectHash:hex.EncodeToString(subjectSum[:]),Alias:alias,Access:"metadata",Scopes:[]string{scope}}
 switch scope{case lexopenDriveMetadataScope:case lexopenDriveReadScope:status.Access="read";status.CanReadFiles=true;case LexOpenDriveManageScope:if app.Settings["oauth_lexopen_drive_management"]!="v1"{return DriveStatus{},driveErr(403,"drive_manage_required")};status.Access="manage";status.CanReadFiles=true;status.CanManageFiles=true;default:return DriveStatus{},driveErr(403,"drive_scope_invalid")}
 raw,_:=json.Marshal([]string{app.Provider,app.Kind,app.ClientID,app.Settings["oauth_account"],scope,app.Settings["oauth_lexopen_import_revision"]});sum:=sha256.Sum256(raw);status.AccountRevision=hex.EncodeToString(sum[:]);return status,nil
}
type DriveRead struct{BindingRevision string `json:"bindingRevision"`;Path string `json:"path"`;Query map[string]string `json:"query,omitempty"`;MaxBytes int `json:"max_bytes"`}
type DriveReadResult struct{Status int `json:"status"`;MIME string `json:"mime"`;BodyBase64 string `json:"body_base64"`;SHA256 string `json:"sha256"`;Bytes int `json:"bytes"`}
var driveFieldToken=regexp.MustCompile(`[A-Za-z][A-Za-z0-9]*`)
func driveFields(s string)bool{if !driveText(s,2000,true)||strings.ContainsAny(s,"* /\\%?#"){return false};allowed:=map[string]bool{};for _,v:=range strings.Fields("nextPageToken incompleteSearch files id name mimeType version modifiedTime size parents trashed md5Checksum sha256Checksum capabilities canDownload canAddChildren canEdit driveId ownedByMe"){allowed[v]=true};depth:=0;for _,r:=range s{if r=='(' {depth++;if depth>3{return false}};if r==')'{depth--;if depth<0{return false}};if !(r>='a'&&r<='z'||r>='A'&&r<='Z'||r>='0'&&r<='9'||r==','||r=='('||r==')'){return false}};if depth!=0{return false};tokens:=driveFieldToken.FindAllString(s,-1);if len(tokens)==0||len(tokens)>60{return false};for _,v:=range tokens{if !allowed[v]{return false}};return true}
func driveReadTarget(body DriveRead,canRead bool)(string,error){
 if !lexopenDriveHex.MatchString(body.BindingRevision)||body.MaxBytes<1||body.MaxBytes>lexopenDriveMaxRead||len(body.Query)>8{return "",driveErr(400,"drive_request_invalid")};path:=body.Path;if path=="/drive/v3/about"{if len(body.Query)!=1||body.Query["fields"]!="user(permissionId)"{return "",driveErr(400,"drive_request_invalid")}}else{
  m:=regexp.MustCompile(`^/drive/v3/files(?:/([A-Za-z0-9_-]{1,200})(/export)?)?$`).FindStringSubmatch(path);if len(m)==0||m[1]=="generateIds"{return "",driveErr(400,"drive_request_invalid")};for key,v:=range body.Query{if !driveText(v,2048,true){return "",driveErr(400,"drive_request_invalid")};switch key{case "fields":if !driveFields(v){return "",driveErr(400,"drive_request_invalid")};case "pageSize":n,e:=strconv.Atoi(v);if m[1]!=""||e!=nil||n<1||n>100{return "",driveErr(400,"drive_request_invalid")};case "pageToken","q":if m[1]!=""{return "",driveErr(400,"drive_request_invalid")};case "spaces":if v!="drive"||m[1]!=""{return "",driveErr(400,"drive_request_invalid")};case "orderBy":if m[1]!=""||(v!="name"&&v!="name_natural"&&v!="modifiedTime desc"){return "",driveErr(400,"drive_request_invalid")};case "alt":if v!="media"||m[1]==""||m[2]!=""||!canRead{return "",driveErr(403,"drive_read_required")};case "mimeType":if m[2]==""||!canRead||!driveExportMIME(v){return "",driveErr(403,"drive_read_required")};default:return "",driveErr(400,"drive_request_invalid")}};if m[2]!=""&&(!canRead||body.Query["mimeType"]==""){return "",driveErr(403,"drive_read_required")};if m[1]==""&&body.Query["pageSize"]==""{return "",driveErr(400,"drive_request_invalid")}
 };u:=url.URL{Scheme:"https",Host:"www.googleapis.com",Path:path};q:=url.Values{};for k,v:=range body.Query{q.Set(k,v)};u.RawQuery=q.Encode();return u.String(),nil
}
func driveExportMIME(s string)bool{switch s{case "text/plain","text/csv","application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.presentationml.presentation":return true};return false}
func(m *Manager)driveToken(ctx context.Context,alias,revision string)(string,error){status,e:=m.LexOpenDriveStatus(alias);if e!=nil{return "",e};if revision!=""&&status.AccountRevision!=revision{return "",driveErr(409,"drive_account_changed")};token,e:=m.OAuth().Token(ctx,alias);if e!=nil||token==""{if oauth.ReconnectRequired(e){return "",driveErr(409,"oauth_reconnect_required")};return "",driveErr(503,"drive_account_unavailable")};after,e:=m.LexOpenDriveStatus(alias);if e!=nil||after.AccountRevision!=status.AccountRevision{return "",driveErr(409,"drive_account_changed")};return token,nil}
func driveHTTP(ctx context.Context,token,method,target string,payload io.Reader,ctype string,max int)([]byte,string,error){
 req,e:=http.NewRequestWithContext(ctx,method,target,payload);if e!=nil{return nil,"",driveErr(400,"drive_request_invalid")};req.Header.Set("Authorization","Bearer "+token);req.Header.Set("Accept","application/json");if ctype!=""{req.Header.Set("Content-Type",ctype)};resp,e:=lexopenDriveHTTPDo(req);if e!=nil{return nil,"",driveErr(502,"drive_unavailable")};defer resp.Body.Close();if resp.StatusCode<200||resp.StatusCode>=300{io.Copy(io.Discard,io.LimitReader(resp.Body,4096));switch resp.StatusCode{case 403:return nil,"",driveErr(403,"drive_access_denied");case 404:return nil,"",driveErr(404,"drive_not_found");case 401:return nil,"",driveErr(409,"oauth_reconnect_required");default:return nil,"",driveErr(502,"drive_unavailable")}};if resp.ContentLength>int64(max){return nil,"",driveErr(413,"drive_response_too_large")};raw,e:=io.ReadAll(io.LimitReader(resp.Body,int64(max)+1));if e!=nil{return nil,"",driveErr(502,"drive_unavailable")};if len(raw)>max{return nil,"",driveErr(413,"drive_response_too_large")};mt,_,e:=mime.ParseMediaType(resp.Header.Get("Content-Type"));if e!=nil||!driveText(mt,200,true){mt="application/octet-stream"};return raw,mt,nil
}
func(m *Manager)LexOpenDriveRead(ctx context.Context,alias string,body DriveRead)(DriveReadResult,error){status,e:=m.LexOpenDriveStatus(alias);if e!=nil{return DriveReadResult{},e};if status.AccountRevision!=body.BindingRevision{return DriveReadResult{},driveErr(409,"drive_account_changed")};target,e:=driveReadTarget(body,status.CanReadFiles);if e!=nil{return DriveReadResult{},e};token,e:=m.driveToken(ctx,alias,status.AccountRevision);if e!=nil{return DriveReadResult{},e};m.driveMu.Lock();defer m.driveMu.Unlock();current,e:=m.LexOpenDriveStatus(alias);if e!=nil||current.AccountRevision!=body.BindingRevision{return DriveReadResult{},driveErr(409,"drive_account_changed")};raw,mt,e:=driveHTTP(ctx,token,"GET",target,nil,"",body.MaxBytes);if e!=nil{return DriveReadResult{},e};sum:=sha256.Sum256(raw);return DriveReadResult{Status:200,MIME:mt,BodyBase64:base64.StdEncoding.EncodeToString(raw),SHA256:hex.EncodeToString(sum[:]),Bytes:len(raw)},nil}
