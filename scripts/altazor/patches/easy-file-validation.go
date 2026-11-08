package connector

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
)

func lexopenOnlyFileFields(args map[string]any,fields ...string)bool{
	allowed:=map[string]bool{"action":true};for _,key:=range fields{allowed[key]=true}
	for key,value:=range args{
		if !allowed[key]{return false}
		if key=="query"{continue}
		text,ok:=value.(string);if !ok||len(text)>2000{return false};for _,r:=range text{if r<32||r==127{return false}}
	};return true
}
func lexopenExplicitRepo(value any)bool{
	text,ok:=value.(string);if !ok{return false};parts:=strings.Split(text,"/")
	return len(parts)==2&&lexopenRepoPart.MatchString(parts[0])&&lexopenRepoPart.MatchString(parts[1])&&parts[0]!="."&&parts[0]!=".."&&parts[1]!="."&&parts[1]!=".."
}
func lexopenFileQueryNumber(value string,max int)bool{n,err:=strconv.Atoi(value);return err==nil&&n>=1&&n<=max}

// Validate only request construction and metadata. This function never obtains
// an account token, executes a connector, accesses a network or asks the person.
func LexOpenValidateEasyFileCall(kind string,args map[string]any)error{
	action,ok:=args["action"].(string);if !ok{return errors.New("Choose an explicit read-only file action. For a complete file use download_file with its required file target.")}
	if action=="download_file"{
		if kind=="github"{
			if !lexopenExplicitRepo(args["repo"]){return errors.New("GitHub download_file requires repo as owner/repository and path as the exact file, for example README.md. Allowed fields: repo, path, ref, name.")}
			if value,ok:=args["path"].(string);!ok||strings.TrimSpace(value)==""{return errors.New("Missing path: GitHub download_file requires the exact repository file path, for example README.md, together with repo=owner/repository. Allowed fields: repo, path, ref, name.")}
			if !lexopenOnlyFileFields(args,"repo","path","ref","name"){return errors.New("GitHub download_file accepts only repo, path, ref and name. Remove unrelated fields such as state, number or query.")}
		}else if kind=="google-workspace"{
			if value,ok:=args["id"].(string);!ok||!lexopenFileID.MatchString(value){return errors.New("Missing or invalid id: Drive download_file requires the exact selected file id from a listing. Allowed fields: id, name, format.")}
			if !lexopenOnlyFileFields(args,"id","name","format"){return errors.New("Drive download_file accepts only id, name and format. Omit format for ordinary PDFs/files; use text, pdf or docx only for native Google documents.")}
		}else{return errors.New("This account does not support the selected file action.")}
		fn:=lexopenReadFiles(kind)[action];_,err:=fn(Settings{},args);return err
	}
	if kind=="github"&&(action=="get_file"||action=="get_issue"||action=="list_issues"){
		if !lexopenExplicitRepo(args["repo"]){return errors.New("This GitHub read requires the explicit repo=owner/repository selected by the person.")}
		if action=="get_file"{
			value,ok:=args["path"].(string);if !ok||strings.TrimSpace(value)==""{return errors.New("Missing path: GitHub get_file requires repo=owner/repository and the exact file path, for example README.md. Use download_file to obtain a complete local file. Allowed fields: repo, path, ref.")}
			if !lexopenOnlyFileFields(args,"repo","path","ref"){return errors.New("GitHub get_file accepts only repo, path and ref. Remove state, number and other unrelated fields.")}
			if _,err:=lexopenGithubPath(value);err!=nil{return err}
			if ref:=str(args,"ref");len(ref)>200||strings.ContainsAny(ref,"?#"){return errors.New("Invalid repository reference.")};return nil
		}
		if action=="get_issue"{
			if !lexopenOnlyFileFields(args,"repo","number","issue")||!regexp.MustCompile(`^[1-9][0-9]{0,9}$`).MatchString(str(args,"number","issue")){return errors.New("GitHub get_issue requires repo and a positive issue number as a string; no file path or write arguments.")};return nil
		}
		if !lexopenOnlyFileFields(args,"repo","state","limit"){return errors.New("GitHub list_issues accepts only repo, optional state and limit.")}
		if state:=str(args,"state");state!=""&&state!="open"&&state!="closed"&&state!="all"{return errors.New("Issue state must be open, closed or all.")}
		if limit:=str(args,"limit");limit!=""&&!lexopenFileQueryNumber(limit,50){return errors.New("Issue limit must be a string number from 1 to 50.")};return nil
	}
	if action!="request"{return errors.New("This connected account permits only its described file-read actions. Choose the matching file tool; writes and unrelated APIs are unavailable.")}
	if !lexopenOnlyFileFields(args,"method","path","query"){return errors.New("A file request accepts only path, optional method=GET and a query object. No body, headers, token or write fields.")}
	if method:=str(args,"method");method!=""&&method!="GET"{return errors.New("File requests are read-only: method must be GET.")}
	target,ok:=args["path"].(string);if !ok||target==""{return errors.New("Missing path: use the exact relative service API path, for example /drive/v3/files or /repos/OWNER/REPO/contents. A query object may refine the listing.")}
	u,err:=url.Parse(target);if err!=nil||u.IsAbs()||u.Host!=""||u.Fragment!=""||!strings.HasPrefix(u.Path,"/")||strings.HasPrefix(u.Path,"//")||path.Clean(u.Path)!=u.Path||strings.ContainsAny(u.Path,"\\%\x00"){return errors.New("Use an exact relative file API path without a full URL, traversal or encoded separators.")}
	query:=u.Query()
	if raw,exists:=args["query"];exists{
		values,ok:=raw.(map[string]any);if !ok||len(values)>12{return errors.New("query must be an object with the documented file-list fields.")}
		for key,value:=range values{
			var text string
			if key!="pageSize"&&key!="per_page"&&key!="page"{if _,ok:=value.(string);!ok{return errors.New("Non-numeric file-search fields must be strings.")}}
			switch value.(type){case string,float64,int,json.Number: text=fmt.Sprint(value);default:return errors.New("Query values must be bounded strings or numbers.")}
			if len(text)>1500{return errors.New("A query value exceeds the file-search limit.")};query.Set(key,text)
		}
	}
	allowed:=map[string]bool{}
	if kind=="google-workspace"{
		match:=regexp.MustCompile(`^/drive/v3/files(?:/([A-Za-z0-9_-]{1,200})(/export)?)?$`).FindStringSubmatch(u.Path)
		if match==nil{return errors.New("Drive file requests use /drive/v3/files, /drive/v3/files/ID or /drive/v3/files/ID/export. Other Google services are not part of this connection.")}
		for _,key:=range []string{"q","fields","pageSize","pageToken","orderBy","spaces","alt","mimeType"}{allowed[key]=true}
		if size:=query.Get("pageSize");size!=""&&!lexopenFileQueryNumber(size,50){return errors.New("Drive pageSize must be between 1 and 50.")}
		if spaces:=query.Get("spaces");spaces!=""&&spaces!="drive"{return errors.New("This file connection searches the Drive space only.")}
		if alt:=query.Get("alt");alt!=""&&(match[1]==""||alt!="media"){return errors.New("alt=media is only available for a selected Drive file; prefer download_file for complete bytes.")}
		if mime:=query.Get("mimeType");match[2]!=""{if mime!="text/plain"&&mime!="application/pdf"&&mime!="application/vnd.openxmlformats-officedocument.wordprocessingml.document"{return errors.New("A native Google export requires the documented text, PDF or DOCX mimeType.")}}else if mime!=""{return errors.New("mimeType is only available for a native Google export.")}
	}else if kind=="github"{
		for _,key:=range []string{"visibility","per_page","page","sort","direction","type","ref","state"}{allowed[key]=true}
		if u.Path=="/user/repos"{if query.Get("visibility")!="public"||query.Has("type"){return errors.New("For /user/repos set query.visibility=public and omit type. Only public repositories are authorized.")}
		}else if !regexp.MustCompile(`^/users/[A-Za-z0-9_.-]{1,150}/repos$`).MatchString(u.Path)&&!regexp.MustCompile(`^/repos/[A-Za-z0-9_.-]{1,150}/[A-Za-z0-9_.-]{1,150}(?:/contents(?:/[^?#]+)?|/issues(?:/[1-9][0-9]{0,9})?)?$`).MatchString(u.Path){return errors.New("Use a public repository listing or selected repository file/folder/issue path; unrelated GitHub endpoints are unavailable.")}
		if size:=query.Get("per_page");size!=""&&!lexopenFileQueryNumber(size,50){return errors.New("GitHub per_page must be between 1 and 50.")}
		if page:=query.Get("page");page!=""&&!lexopenFileQueryNumber(page,10000){return errors.New("GitHub page must be between 1 and 10000.")}
	}else{return errors.New("Unsupported connected file service.")}
	if len(query)>12{return errors.New("Too many file-search query fields.")}
	for key,values:=range query{if !allowed[key]||len(values)!=1||len(values[0])>1500{return errors.New("The query contains unsupported or oversized file-search fields.")}}
	return nil
}
