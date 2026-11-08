package chat

import (
	"regexp"

	"github.com/madkoding/kitties/internal/connector"
	"github.com/madkoding/kitties/internal/provider"
)

var lexopenEasyGoogleName=regexp.MustCompile(`^altazor-google-[a-f0-9]{16}$`)
var lexopenEasyGithubName=regexp.MustCompile(`^altazor-github-[a-f0-9]{16}$`)

func lexopenSchemaText(description string,max int)map[string]any{return map[string]any{"type":"string","description":description,"maxLength":max}}
func lexopenSchemaEnum(description string,values ...string)map[string]any{return map[string]any{"type":"string","description":description,"enum":values}}
func lexopenSchemaObject(properties map[string]any,required ...string)map[string]any{
	value:=map[string]any{"type":"object","properties":properties,"additionalProperties":false}
	if len(required)>0{value["required"]=required};return value
}

// Only the generated easy accounts receive this contract. The registry's actual
// kind must match the name; no token, header or arbitrary service URL is exposed.
func(s *Service)lexopenNativeConnectorTool(name string)(provider.Tool,bool){
	isGoogle,isGithub:=lexopenEasyGoogleName.MatchString(name),lexopenEasyGithubName.MatchString(name)
	if !isGoogle&&!isGithub{return provider.Tool{},false}
	c,ok:=s.fleet.Connectors().Get(name);if !ok{return provider.Tool{},false}
	kinder,ok:=c.(connector.Kinder);if !ok{return provider.Tool{},false}
	if isGoogle&&kinder.Kind()!="google-workspace"||isGithub&&kinder.Kind()!="github"{return provider.Tool{},false}
	properties:=map[string]any{
		"method":lexopenSchemaEnum("request is read-only; always GET","GET"),
		"name":lexopenSchemaText("Optional simple non-hidden name for the downloaded file; no folder or slash",180),
	}
	var description string
	if isGoogle{
		properties["action"]=lexopenSchemaEnum("request to list/search file metadata; download_file to work with a complete selected file","request","download_file")
		properties["path"]=lexopenSchemaText("For request only: /drive/v3/files to search/list, or /drive/v3/files/ID for the selected file. Use query for search/filter fields. No other Google services or full URLs.",2000)
		properties["id"]=map[string]any{"type":"string","pattern":"^[A-Za-z0-9_-]{1,200}$","description":"Required for download_file: exact Drive id from a confirmed listing, never invent an id"}
		properties["format"]=lexopenSchemaEnum("For download_file of a native Google document only: text, pdf, docx. Omit for ordinary PDFs/documents/files.","text","pdf","docx")
		properties["query"]=lexopenSchemaObject(map[string]any{
			"q":lexopenSchemaText("Drive query: trashed = false, optionally AND name contains 'the requested title'",1500),
			"fields":lexopenSchemaText("Example: nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)",1500),
			"pageSize":map[string]any{"type":"integer","minimum":1,"maximum":50},
			"pageToken":lexopenSchemaText("Exact nextPageToken from the preceding result",1500),
			"orderBy":lexopenSchemaText("Optional Drive sort, for example modifiedTime desc",1500),
			"spaces":lexopenSchemaEnum("Search the user's Drive","drive"),
			"alt":lexopenSchemaEnum("Only for reading a known ordinary file","media"),
			"mimeType":lexopenSchemaEnum("Only for /export of a native Google document","text/plain","application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
		})
		description="READ-ONLY Google Drive account already connected by the person. For requested Drive files, prefer this native connection over opening the browser, requesting a sign-in or using a public URL. Search/list using action=request with path=/drive/v3/files and a query object; then action=download_file with the selected id to obtain the complete original, maximum 4 MiB. Native Google documents can be exported with format=text, pdf or docx. A successful download gives a verified local desktop path, size and SHA-256. Every call waits for the person's approval: do not repeat a pending call. No write, upload, share, mail, calendar, credentials or arbitrary API endpoints. Use local tools on the returned file for reading, OCR, drafting or analysis."
	}else{
		properties["action"]=lexopenSchemaEnum("download_file for a complete repository file; get_file for a partial text preview; request to list repositories/folders; list_issues or get_issue for selected public project work","request","download_file","get_file","list_issues","get_issue")
		properties["repo"]=map[string]any{"type":"string","pattern":"^[A-Za-z0-9_.-]{1,150}/[A-Za-z0-9_.-]{1,150}$","description":"Explicit owner/repository selected by the person, required for download_file/get_file/list_issues/get_issue; public repositories only"}
		properties["path"]=lexopenSchemaText("For download_file/get_file: exact repository file path, e.g. README.md. For request: /user/repos, /users/OWNER/repos or /repos/OWNER/REPO/contents/PATH (and selected project issues). Relative API paths only; no full URLs or traversal.",2000)
		properties["ref"]=lexopenSchemaText("Optional branch/tag/commit explicitly selected by the person",200)
		properties["number"]=map[string]any{"type":"string","pattern":"^[0-9]{1,10}$","description":"Required for get_issue: issue number as a string"}
		properties["state"]=lexopenSchemaEnum("Optional issue state","open","closed","all")
		properties["limit"]=map[string]any{"type":"string","pattern":"^(?:[1-9]|[1-4][0-9]|50)$","description":"Optional issue listing size as a string, e.g. 10"}
		properties["query"]=lexopenSchemaObject(map[string]any{
			"visibility":lexopenSchemaEnum("Required for /user/repos; only public repositories are authorized","public"),
			"per_page":map[string]any{"type":"integer","minimum":1,"maximum":50},
			"page":map[string]any{"type":"integer","minimum":1,"maximum":10000},
			"sort":lexopenSchemaEnum("Optional listing order","created","updated","pushed","full_name"),
			"direction":lexopenSchemaEnum("Optional order direction","asc","desc"),
			"type":lexopenSchemaEnum("Optional /users/OWNER/repos filter; omit for /user/repos","public"),
			"ref":lexopenSchemaText("Optional explicit branch/tag/commit for a folder listing",200),
			"state":lexopenSchemaEnum("Optional selected project issue state","open","closed","all"),
		})
		description="READ-ONLY GitHub account already connected by the person, for public repositories only. For a requested repository or file, prefer this native connection instead of browser navigation or asking for a sign-in. Use action=download_file with repo=OWNER/REPO and path=the exact selected file to obtain the complete file, maximum 4 MiB, and a verified local desktop path, size and SHA-256. get_file returns a partial text preview only. To list public repositories use request path=/user/repos with query={visibility:public,per_page:20}, or /users/OWNER/repos; list folders with /repos/OWNER/REPO/contents/PATH. Every call waits for the person's approval: do not repeat a pending call. No writes, commits, publication, private repositories, credentials or arbitrary API endpoints. Use local tools on the returned file for analysis and drafting."
	}
	return provider.Tool{Name:prefixConnector+name,Description:description,Parameters:lexopenSchemaObject(properties,"action")},true
}
