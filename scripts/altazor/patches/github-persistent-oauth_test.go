package oauth

import (
 "context"
 "errors"
 "io"
 "net/http"
 "strings"
 "sync"
 "sync/atomic"
 "testing"
 "time"
)
func lexopenGHStore(public bool)*memStore {s:=&memStore{provider:"github",kind:"github",id:"fixture-gh-client",secret:"fixture-gh-secret",settings:map[string]string{"oauth_lexopen_persistent":"v1","oauth_lexopen_github_refresh":"v1","oauth_scopes":"read:user"},creds:Credentials{AccessToken:"fixture-gh-old",RefreshToken:"fixture-gh-refresh",Expiry:time.Now().Add(-time.Minute),Account:"12345"}};if public {s.secret="";s.settings["oauth_public_client"]="true"};return s}
const lexopenGHAnswer=`{"access_token":"fixture-gh-new","refresh_token":"fixture-gh-rotated","expires_in":28800,"refresh_token_expires_in":15897600,"scope":"read:user","token_type":"bearer"}`
func TestLexOpenGitHubPersistentWebDeviceConcurrentRotation(t *testing.T){for _,public:=range []bool{false,true}{t.Run(map[bool]string{false:"web",true:"device"}[public],func(t *testing.T){s:=lexopenGHStore(public);m:=New(s);var calls atomic.Int32;m.httpDo=func(r *http.Request)(*http.Response,error){calls.Add(1);r.ParseForm();if r.URL.String()!="https://github.com/login/oauth/access_token"||r.Method!="POST"||r.Form.Get("scope")!=""||r.Form.Get("client_id")!=s.id||r.Form.Get("grant_type")!="refresh_token"||r.Form.Get("refresh_token")!="fixture-gh-refresh"||r.Form.Get("client_secret")!=s.secret||r.Header.Get("Authorization")!=""{t.Error("incorrect fixed refresh request")};return &http.Response{StatusCode:200,Body:io.NopCloser(strings.NewReader(lexopenGHAnswer))},nil};var wg sync.WaitGroup;for range 16{wg.Add(1);go func(){defer wg.Done();tok,e:=m.Token(context.Background(),"account");if e!=nil||tok!="fixture-gh-new"{t.Error("refresh rejected")}}()};wg.Wait();if calls.Load()!=1{t.Fatal("rotation was replayed")};c,_:=s.OAuthCredentials("account");if c.RefreshToken!="fixture-gh-rotated"||c.Account!="12345"||c.Expiry.Before(time.Now().Add(7*time.Hour)){t.Fatal("pair/account/expiry not saved")};again:=New(s);again.httpDo=func(*http.Request)(*http.Response,error){t.Fatal("valid restart token unexpectedly refreshed");return nil,nil};if tok,e:=again.Token(context.Background(),"account");e!=nil||tok!="fixture-gh-new"{t.Fatal("restart lost pair")};p:=lexopenGitHubProvider(Providers["github"],mustGHApp(s));if strings.Join(p.Scopes," ")!="read:user"||p.NoExpiry{t.Fatal("native flow broad scopes or fake forever")}})}}
func mustGHApp(s *memStore)App{a,_:=s.OAuthApp("account");return a}
func TestLexOpenGitHubPersistentRejectedRepliesNeverOverwrite(t *testing.T){for _,tc:=range []struct{name,body string;status int;want error}{
 {"missing refresh",`{"access_token":"reflected-private","expires_in":28800,"scope":"read:user","token_type":"bearer"}`,200,ErrReconnectRequired},
 {"missing expiry",`{"access_token":"reflected-private","refresh_token":"new","scope":"read:user","token_type":"bearer"}`,200,ErrReconnectRequired},
 {"too short",`{"access_token":"reflected-private","refresh_token":"new","expires_in":59,"scope":"read:user","token_type":"bearer"}`,200,ErrReconnectRequired},
 {"too long",`{"access_token":"reflected-private","refresh_token":"new","expires_in":31622401,"scope":"read:user","token_type":"bearer"}`,200,ErrReconnectRequired},
 {"missing scope",`{"access_token":"reflected-private","refresh_token":"new","expires_in":28800,"token_type":"bearer"}`,200,ErrReconnectRequired},
 {"broad scope",`{"access_token":"reflected-private","refresh_token":"new","expires_in":28800,"scope":"read:user repo","token_type":"bearer"}`,200,ErrReconnectRequired},
 {"wrong type",`{"access_token":"reflected-private","refresh_token":"new","expires_in":28800,"scope":"read:user","token_type":"mac"}`,200,ErrReconnectRequired},
 {"same rotation",`{"access_token":"reflected-private","refresh_token":"fixture-gh-refresh","expires_in":28800,"scope":"read:user","token_type":"bearer"}`,200,ErrReconnectRequired},
 {"revoked",`{"error":"bad_refresh_token","error_description":"reflected-private"}`,400,ErrReconnectRequired},
 {"unauthorized",`{"message":"reflected-private"}`,401,ErrReconnectRequired},
 {"temporary",`{"error":"server_error","error_description":"reflected-private"}`,503,ErrUnavailable},
 }{t.Run(tc.name,func(t *testing.T){s:=lexopenGHStore(false);before,_:=s.OAuthCredentials("account");m:=manager(s,&answer{code:tc.status,body:tc.body});m.now=time.Now;tok,e:=m.Token(context.Background(),"account");after,_:=s.OAuthCredentials("account");if tok!=""||!errors.Is(e,tc.want)||strings.Contains(e.Error(),"reflected-private")||after!=before{t.Fatal("unsafe reply changed saved pair or leaked response")}})}}
func TestLexOpenGitHubPersistentRemovedDoesNotRefresh(t *testing.T){s:=lexopenGHStore(true);s.appErr=errors.New("connector removed");m:=New(s);m.httpDo=func(*http.Request)(*http.Response,error){t.Fatal("removed connector reached provider");return nil,nil};if _,e:=m.Token(context.Background(),"account");e==nil{t.Fatal("removed connector accepted")}}
func TestLexOpenGitHubPersistentFailedSaveDoesNotReturnToken(t *testing.T){s:=lexopenGHStore(false);s.saveErr=errors.New("fixture persistence failure");m:=manager(s,&answer{code:200,body:lexopenGHAnswer});m.now=time.Now;if tok,e:=m.Token(context.Background(),"account");tok!=""||e==nil{t.Fatal("unpersisted rotated token returned")}}
