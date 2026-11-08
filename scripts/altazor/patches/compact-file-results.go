package connector

import (
	"context"
	"encoding/json"
	"net/url"
	"regexp"
	"strings"
)

// This state is created only by Registry.Call after the selected easy account,
// registered service kind and read-only arguments have all been validated.
type lexopenFileOutputKey struct{}
type lexopenFileOutputState struct { kind string; truncated bool }
var lexopenGoogleFileAccount=regexp.MustCompile(`^altazor-google-[a-f0-9]{16}$`)
var lexopenGithubFileAccount=regexp.MustCompile(`^altazor-github-[a-f0-9]{16}$`)

func lexopenBeginFileOutput(ctx context.Context,name,kind string,args map[string]any)(context.Context,*lexopenFileOutputState){
	if !(kind=="github"&&lexopenGithubFileAccount.MatchString(name)||kind=="google-workspace"&&lexopenGoogleFileAccount.MatchString(name))||LexOpenValidateEasyFileCall(kind,args)!=nil{return ctx,nil}
	s:=&lexopenFileOutputState{kind:kind,truncated:str(args,"action")=="get_file"}
	return context.WithValue(ctx,lexopenFileOutputKey{},s),s
}

func lexopenBoundFileOutput(text string,limit int)(string,bool){
	runes:=[]rune(strings.TrimSpace(text));if len(runes)<=limit{return string(runes),false}
	return string(runes[:limit])+"\n[PARTIAL RESULT: omitted content exceeded the read context limit. Never infer that an absent item does not exist.]",true
}

func lexopenReadPage(kind,path string,args map[string]any,rows []map[string]any,extra map[string]any,state *lexopenFileOutputState)string{
	page:=map[string]any{"service":kind,"source_path":path,"page_only":true,"exhaustive":false,"notice":"This is only the returned page. An item absent from this page is not proven absent. Use an explicit user-provided file target directly; never substitute another repository or file.","items":rows}
	params:=map[string]any{};if query,ok:=args["query"].(map[string]any);ok{for _,key:=range []string{"page","per_page","visibility","pageSize"}{if v,found:=query[key];found{params[key]=v}}};if len(params)>0{page["page_parameters"]=params}
	for key,value:=range extra{page[key]=value}
	for {page["items"]=rows;page["items_truncated"]=state.truncated;data,_:=json.Marshal(page);if len([]rune(string(data)))<=9500{return string(data)};state.truncated=true;if len(rows)==0{return `{"page_only":true,"exhaustive":false,"items_truncated":true,"items":[],"notice":"The response metadata exceeded the context limit. No absence can be inferred."}`};rows=rows[:len(rows)-1]}
}

func lexopenProjectFileFields(item map[string]any,keys []string,state *lexopenFileOutputState)map[string]any{
	out:=map[string]any{};for _,key:=range keys{if value,ok:=item[key];ok{switch v:=value.(type){case string:runes:=[]rune(v);if len(runes)>700{value=string(runes[:700]);state.truncated=true};out[key]=value;case float64,bool:out[key]=value}}};return out
}

// Work from the complete bounded HTTP body before requestAnswer and Registry's
// legacy clipping. This does not paginate, request more data or expose headers.
func lexopenEasyAPIRead(ctx context.Context,kind,action string,args map[string]any,raw []byte)(string,bool){
	state,ok:=ctx.Value(lexopenFileOutputKey{}).(*lexopenFileOutputState);if !ok||state.kind!=kind||action!="request"{return "",false}
	target,_:=url.Parse(str(args,"path"));if target==nil{return "",false};path:=target.Path
	var parsed any
	if json.Unmarshal(raw,&parsed)!=nil{
		// Export/media responses may legitimately be plain text. They are always
		// previews, never receipts proving a complete local download.
		state.truncated=true
		text,_:=lexopenBoundFileOutput(string(raw),9000)
		return "PARTIAL READ PREVIEW: the response is not a complete structured listing or verified local file. Do not infer missing items or claim a completed download.\n"+text,true
	}
	if kind=="github"{
		if list,ok:=parsed.([]any);ok{
			rows:=[]map[string]any{};excluded:=0
			repos:=path=="/user/repos"||strings.HasPrefix(path,"/users/")&&strings.HasSuffix(path,"/repos")
			keys:=[]string{"name","path","type","sha","size","html_url"};if repos{keys=[]string{"full_name","private","html_url","default_branch"}}
			for _,entry:=range list{item,ok:=entry.(map[string]any);if !ok{state.truncated=true;continue};if repos{private,verified:=item["private"].(bool);if !verified||private{excluded++;continue}};if len(rows)>=50{state.truncated=true;continue};rows=append(rows,lexopenProjectFileFields(item,keys,state))}
			return lexopenReadPage("github",path,args,rows,map[string]any{"excluded_private_or_unverified":excluded},state),true
		}
	}
	if kind=="google-workspace"{
		if object,ok:=parsed.(map[string]any);ok{
			keys:=[]string{"id","name","mimeType","modifiedTime","size","webViewLink"}
			if path=="/drive/v3/files"{
				rows:=[]map[string]any{};if list,ok:=object["files"].([]any);ok{for _,entry:=range list{item,ok:=entry.(map[string]any);if !ok{state.truncated=true;continue};if len(rows)>=50{state.truncated=true;continue};rows=append(rows,lexopenProjectFileFields(item,keys,state))}}
				extra:=lexopenProjectFileFields(object,[]string{"nextPageToken","incompleteSearch"},state)
				return lexopenReadPage("google-drive",path,args,rows,extra,state),true
			}
			if strings.HasPrefix(path,"/drive/v3/files/")&&!strings.HasSuffix(path,"/export"){
				result:=lexopenProjectFileFields(object,keys,state);result["source_path"]=path;data,_:=json.Marshal(result);return string(data),true
			}
		}
	}
	text,truncated:=lexopenBoundFileOutput(string(raw),9000);state.truncated=state.truncated||truncated
	return text,true
}
