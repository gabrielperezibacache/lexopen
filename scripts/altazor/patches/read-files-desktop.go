package chat

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/madkoding/kitties/internal/connector"
	"github.com/madkoding/kitties/internal/kitty"
)

// No downloaded content is interpreted as code. It travels only over stdin into
// a fixed writer, inside the exact approved kitty and a content-addressed folder.
const lexopenDownloadWriter = `import base64,hashlib,os,sys
root,name,expected=sys.argv[1:]
data=base64.b64decode(sys.stdin.buffer.read(5592410),validate=True)
assert len(data)<=4194304 and hashlib.sha256(data).hexdigest()==expected
assert name and len(name)<=180 and not name.startswith('.') and not any(ord(c)<32 or ord(c)==127 or c in '/\\' for c in name)
flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
base=os.open(root,flags)
opened=[base]
try:
 for part in ('imports',expected):
  try: os.mkdir(part,0o700,dir_fd=base)
  except FileExistsError: pass
  base=os.open(part,flags,dir_fd=base);opened.append(base)
 try:
  fd=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=base)
 except FileExistsError:
  fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=base)
  with os.fdopen(fd,'rb') as f: old=f.read(4194305)
  assert len(old)<=4194304 and hashlib.sha256(old).hexdigest()==expected
 else:
  with os.fdopen(fd,'wb') as f: f.write(data);f.flush();os.fsync(f.fileno())
 print(root+'/imports/'+expected+'/'+name)
finally:
 for fd in reversed(opened): os.close(fd)
`

func lexopenWriteDownload(ctx context.Context, in inputRunner, kittyID, workspace, name string, data []byte) (string,error) {
	if in == nil || workspace == "" || name == "" || len(data) > 4<<20 || len(name)>180 || strings.HasPrefix(name,".") || strings.ContainsAny(name,"/\\\x00\r\n") { return "",errors.New("download cannot be transferred to this desktop") }
	hash := sha256.Sum256(data); expected := hex.EncodeToString(hash[:])
	ctx,cancel := context.WithTimeout(ctx,15*time.Second);defer cancel()
	out,err := in.ExecInput(ctx,kittyID,base64.StdEncoding.EncodeToString(data),"python3","-c",lexopenDownloadWriter,workspace,name,expected)
	path := workspace+"/imports/"+expected+"/"+name
	if err != nil || strings.TrimSpace(out) != path { return "",errors.New("the file remains in the private artifact library; its transfer to the desktop was not confirmed") }
	return path,nil
}

func (s *Service) lexopenDeliverApprovedDownload(ctx context.Context, k *kitty.Kitty, args map[string]any, res *connector.Result) {
	if args["action"]!="download_file" || res.Err!="" || res.File==nil || k==nil || !k.Desktop || res.Kind!="google-workspace" && res.Kind!="github" { return }
	in,_ := s.fleet.(inputRunner)
	path,err := lexopenWriteDownload(ctx,in,k.ID,workspaceOf(k),res.File.Name,res.File.Data)
	if err != nil { res.Output += "\nDesktop transfer not confirmed: "+err.Error(); return }
	res.Output += fmt.Sprintf("\nVerified desktop file: %s. Use local document tools on that file; opening it is a separate action.",path)
}
