package gateway

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"

	"github.com/madkoding/kitties/internal/chat"
)

type stagedFileChats interface{
	StageFileAction(context.Context,string,chat.StagedFileAction)(chat.StagedFileActionResult,error)
}

func(s *Server)handleLexopenStageFile(w http.ResponseWriter,r *http.Request){
	w.Header().Set("Cache-Control","no-store")
	address,_,err:=net.SplitHostPort(r.RemoteAddr);ip:=net.ParseIP(address)
	provided,bearer:=strings.CutPrefix(r.Header.Get("Authorization"),"Bearer ")
	if err!=nil||ip==nil||!ip.IsLoopback()||!bearer||s.token==""||subtle.ConstantTimeCompare([]byte(provided),[]byte(s.token))!=1{lexopenFileStageError(w,403,"file_action_forbidden");return}
	stager,ok:=s.chats.(stagedFileChats);if !ok{lexopenFileStageError(w,503,"file_action_unavailable");return}
	var body chat.StagedFileAction
	decoder:=json.NewDecoder(http.MaxBytesReader(w,r.Body,32768));decoder.DisallowUnknownFields()
	if decoder.Decode(&body)!=nil||decoder.Decode(new(any))!=io.EOF{lexopenFileStageError(w,400,"file_action_invalid");return}
	result,err:=stager.StageFileAction(r.Context(),r.PathValue("id"),body)
	if err!=nil{
		switch{case errors.Is(err,chat.ErrAsyncConflict):lexopenFileStageError(w,409,"file_action_conflict")
		case errors.Is(err,chat.ErrBusy):lexopenFileStageError(w,409,"file_action_busy")
		case errors.Is(err,chat.ErrStagedFileInvalid):lexopenFileStageError(w,400,"file_action_invalid")
		default:lexopenFileStageError(w,503,"file_action_unavailable")};return
	}
	reply(w,http.StatusOK,result)
}

func lexopenFileStageError(w http.ResponseWriter,status int,code string){reply(w,status,map[string]any{"ok":false,"code":code,"error":"No se pudo preparar la descarga del archivo seleccionado."})}
