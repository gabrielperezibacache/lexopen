package oauth
func lexopenDriveProvider(p Provider,app App)Provider{if app.Provider=="google"&&app.Kind=="google-workspace"&&lexopenPersistentApp(app){switch app.Settings["oauth_scopes"]{case "https://www.googleapis.com/auth/drive","https://www.googleapis.com/auth/drive.readonly","https://www.googleapis.com/auth/drive.metadata.readonly":p.Scopes=[]string{app.Settings["oauth_scopes"]}}};return p}
