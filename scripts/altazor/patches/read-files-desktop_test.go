package chat

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

type lexopenLocalWriter struct { kitty string; calls int }
func (w *lexopenLocalWriter) ExecInput(ctx context.Context, kitty, stdin string, argv ...string) (string,error) {
	w.kitty=kitty;w.calls++
	cmd:=exec.CommandContext(ctx,argv[0],argv[1:]...);cmd.Stdin=strings.NewReader(stdin)
	data,err:=cmd.Output();return string(data),err
}
type lexopenFailedWriter struct{}
func (lexopenFailedWriter) ExecInput(context.Context,string,string,...string)(string,error){return "",errors.New("fixture transfer failure")}

func TestLexOpenApprovedFileTransferPreservesBytesAndDoesNotOverwrite(t *testing.T) {
	if _,err:=exec.LookPath("python3");err!=nil{t.Fatal("python3 required for desktop writer verification")}
	root:=t.TempDir();writer:=&lexopenLocalWriter{};data:=[]byte("fixture legal dates: 2030-05-10 and 2030-05-16\n")
	path,err:=lexopenWriteDownload(context.Background(),writer,"owned-kitty",root,"Resolución.txt",data)
	if err!=nil||writer.kitty!="owned-kitty"{t.Fatalf("transfer failed: %v",err)}
	actual,err:=os.ReadFile(path);if err!=nil||string(actual)!=string(data){t.Fatal("bytes differ")}
	if _,err:=lexopenWriteDownload(context.Background(),writer,"owned-kitty",root,"Resolución.txt",data);err!=nil{t.Fatal("identical file must verify without overwrite")}
	if err:=os.WriteFile(path,[]byte("changed locally"),0600);err!=nil{t.Fatal(err)}
	if _,err:=lexopenWriteDownload(context.Background(),writer,"owned-kitty",root,"Resolución.txt",data);err==nil{t.Fatal("overwrote existing edited file")}
	actual,_=os.ReadFile(path);if string(actual)!="changed locally"{t.Fatal("local edit lost")}
}

func TestLexOpenApprovedFileTransferRejectsSymlinksAndUnknownOutcome(t *testing.T) {
	data:=[]byte("fixture bytes");hash:=sha256.Sum256(data);sha:=hex.EncodeToString(hash[:]);outside:=t.TempDir()
	for _,part:=range []string{"imports","digest","file"}{
		root:=t.TempDir();target:=filepath.Join(root,"imports")
		if part!="imports"{if err:=os.MkdirAll(filepath.Join(target,sha),0700);err!=nil{t.Fatal(err)};target=filepath.Join(target,sha)}
		if part=="digest"{if err:=os.Remove(target);err!=nil{t.Fatal(err)}}
		if part=="file"{target=filepath.Join(target,"fixture.txt")}
		if err:=os.Symlink(outside,target);err!=nil{t.Fatal(err)}
		if _,err:=lexopenWriteDownload(context.Background(),&lexopenLocalWriter{},"owned",root,"fixture.txt",data);err==nil{t.Fatalf("followed %s symlink",part)}
	}
	if _,err:=lexopenWriteDownload(context.Background(),lexopenFailedWriter{},"owned",t.TempDir(),"fixture.txt",data);err==nil{t.Fatal("claimed uncertain transfer succeeded")}
	writer:=&lexopenLocalWriter{}
	if _,err:=lexopenWriteDownload(context.Background(),writer,"owned",t.TempDir(),"../outside",data);err==nil||writer.calls!=0{t.Fatal("unsafe name reached the writer")}
}
