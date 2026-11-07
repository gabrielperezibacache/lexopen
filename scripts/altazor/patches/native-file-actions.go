package chat

import (
	"errors"
	"strings"

	"github.com/madkoding/kitties/internal/connector"
	"github.com/madkoding/kitties/internal/kitty"
	"github.com/madkoding/kitties/internal/provider"
)

func(s *Service)lexopenNativeFileActionTools(name string)[]provider.Tool{
	base,ok:=s.lexopenNativeConnectorTool(name);if !ok{return nil}
	properties:=base.Parameters["properties"].(map[string]any)
	makeTool:=func(action,description string,fields,required []string)provider.Tool{
		props:=map[string]any{};for _,key:=range fields{props[key]=properties[key]}
		if action=="download_file"||action=="get_file"{if lexopenEasyGithubName.MatchString(name){props["path"]=lexopenSchemaText("REQUIRED exact repository-relative file path, for example README.md or docs/syllabus.md. Do not supply a folder, URL or API path.",1500)}}
		if action=="request"{if lexopenEasyGoogleName.MatchString(name){props["path"]=lexopenSchemaText("REQUIRED relative Google Drive API path: /drive/v3/files to search/list files, or /drive/v3/files/ID for selected metadata. Use query for filters.",2000)}else{props["path"]=lexopenSchemaText("REQUIRED relative GitHub API path: /user/repos with query.visibility=public, /users/OWNER/repos, or /repos/OWNER/REPO/contents/PATH to list a selected folder.",2000)}}
		return provider.Tool{Name:prefixConnector+name+"_"+action,Description:description+" The action is fixed by this function; do not send an action argument. This already-connected account requires approval for every call: never repeat a pending call.",Parameters:lexopenSchemaObject(props,required...)}
	}
	if lexopenEasyGoogleName.MatchString(name){return []provider.Tool{
		makeTool("download_file","Download one COMPLETE selected Google Drive file into your desktop. REQUIRED id comes from the listing. PDFs/ordinary files: omit format; native Google documents: format text/pdf/docx. Returns verified local path, bytes and SHA-256 (maximum 4 MiB).",[]string{"id","name","format"},[]string{"id"}),
		makeTool("request","Search/list Google Drive files using REQUIRED path=/drive/v3/files and optional query q, fields, pageSize (maximum 50). Use the exact returned id with download_file to read a complete document. Relative Drive API paths and GET only.",[]string{"path","query","method"},[]string{"path"}),
	}}
	return []provider.Tool{
		makeTool("download_file","Download one COMPLETE public GitHub repository file into your desktop. REQUIRED repo=owner/repository and path=exact/file, for example README.md. Returns verified local path, bytes and SHA-256 (maximum 4 MiB). Prefer this function when asked to download/read/work with a complete file.",[]string{"repo","path","ref","name"},[]string{"repo","path"}),
		makeTool("request","List public GitHub repositories or selected repository folders. REQUIRED path: /user/repos with query visibility=public; /users/OWNER/repos; or /repos/OWNER/REPO/contents/PATH. Relative read-only API paths only. Use download_file for complete file contents.",[]string{"path","query","method"},[]string{"path"}),
		makeTool("get_file","Read only a PARTIAL TEXT PREVIEW of one public repository file. REQUIRED repo=owner/repository and exact path, e.g. README.md. Use download_file instead to download or work with the complete local file.",[]string{"repo","path","ref"},[]string{"repo","path"}),
		makeTool("list_issues","List issues for one explicit public GitHub repo. REQUIRED repo=owner/repository. This is for issues, never for downloading a file.",[]string{"repo","state","limit"},[]string{"repo"}),
		makeTool("get_issue","Read a selected public repository issue. REQUIRED repo=owner/repository and number as a string. This is not a file reader.",[]string{"repo","number"},[]string{"repo","number"}),
	}
}

func(s *Service)lexopenFromFileCalls(calls []provider.ToolCall,k *kitty.Kitty,allowed map[string]string,fileFocus bool)[]action{
	actions:=fromCalls(calls)
	for i:=range actions{
		a:=&actions[i];if a.kind!="connector"{continue}
		if _,selected:=allowed[a.name];selected{
			if fileFocus&&(lexopenEasyGoogleName.MatchString(a.name)||lexopenEasyGithubName.MatchString(a.name)){a.invalid="For this file task use the per-action download_file or request function with its required target fields, not the generic connection tool."}
			continue
		}
		resolved:=false
		for _,name:=range sortedKeys(allowed){
			selected:=false;for _,current:=range k.Connectors{selected=selected||current==name};if !selected{continue}
			for _,tool:=range s.lexopenNativeFileActionTools(name){
				if prefixConnector+a.name!=tool.Name{continue}
				bound:=strings.TrimPrefix(tool.Name,prefixConnector+name+"_")
				args:=map[string]any{};for key,value:=range a.args{args[key]=value}
				if value,exists:=args["action"];exists{if given,ok:=value.(string);!ok||given!=bound{a.invalid="This file function has a fixed read action. Remove the conflicting action argument and provide only the function's declared target fields."}}
				args["action"]=bound;a.name=name;a.args=args;resolved=true;break
			}
			if resolved{break}
		}
		if !resolved{a.invalid="This native file function is not available in the selected connections of this desktop. Use only the offered tools; do not invent an account or action."}
	}
	return actions
}

func(s *Service)lexopenPreflightEasyFile(k *kitty.Kitty,a action)error{
	if a.invalid!=""{return errors.New(a.invalid)}
	google,github:=lexopenEasyGoogleName.MatchString(a.name),lexopenEasyGithubName.MatchString(a.name)
	if !google&&!github{return nil}
	selected:=false;for _,name:=range k.Connectors{selected=selected||name==a.name}
	if !selected{return errors.New("This connected account was not selected for the current desktop.")}
	c,ok:=s.fleet.Connectors().Get(a.name);if !ok{return errors.New("The selected file connection is unavailable.")}
	kinder,ok:=c.(connector.Kinder);if !ok||google&&kinder.Kind()!="google-workspace"||github&&kinder.Kind()!="github"{return errors.New("The selected file connection does not match its registered service.")}
	return connector.LexOpenValidateEasyFileCall(kinder.Kind(),a.args)
}
