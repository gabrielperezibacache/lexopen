package chat

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/madkoding/kitties/internal/approvals"
	"github.com/madkoding/kitties/internal/kitty"
)

type stagedFiler struct{calls int;data []byte;kind string;fail bool}
func(f *stagedFiler)Describe()string{return "synthetic read-only file"}
func(f *stagedFiler)Kind()string{return f.kind}
func(f *stagedFiler)Call(context.Context,map[string]any)(string,error){return "",errors.New("file action required")}
func(f *stagedFiler)CallFile(_ context.Context,a map[string]any)(string,string,[]byte,error){f.calls++;if f.fail{return "untrusted provider text","",nil,errors.New("untrusted provider detail")};return "Downloaded a PDF with five pages (untrusted claim)","fixture.txt",f.data,nil}
type stagedLocalFleet struct{*fakeFleet;root string;fail bool;tamper bool;calls int}
func(f *stagedLocalFleet)ExecInput(ctx context.Context,_ string,stdin string,argv ...string)(string,error){
	f.calls++;if f.fail{return "",errors.New("synthetic transfer failure")}
	args:=append([]string(nil),argv...);for i,v:=range args{if v=="/home/kitty/work"{args[i]=f.root}}
	if f.tamper&&strings.Contains(strings.Join(args," "),"import hashlib,io,json"){
		matches,_:=filepath.Glob(filepath.Join(f.root,"imports","*","fixture.txt"));if len(matches)==1{os.WriteFile(matches[0],[]byte("tampered"),0600)}
	}
	cmd:=exec.CommandContext(ctx,args[0],args[1:]...);cmd.Stdin=strings.NewReader(stdin);out,err:=cmd.Output();return strings.ReplaceAll(string(out),f.root,"/home/kitty/work"),err
}
func stagedChatFixture(t *testing.T)(*Service,*stagedLocalFleet,*scripted,*stagedFiler,string,StagedFileAction){
	t.Helper();f,brain,_,_:=fleet(t);k,_:=f.Get("ana");name:="altazor-google-0123456789abcdef";k.Connectors=[]string{name};k.Status=kitty.StatusRunning
	file:=&stagedFiler{kind:"google-workspace",data:[]byte("Primera línea jurídica\nContenido académico\n")};f.conns.Add(name,file)
	d:=&stagedLocalFleet{fakeFleet:f,root:t.TempDir()};s:=service(t,d);store,err:=approvals.Open(filepath.Join(t.TempDir(),"approvals.json"));if err!=nil{t.Fatal(err)};s.SetApprovals(store)
	sess,err:=s.Create("Synthetic file task",[]string{k.ID});if err!=nil{t.Fatal(err)}
	return s,d,brain,file,sess.ID,StagedFileAction{RequestID:"file-request-one",Kitty:k.ID,Connector:name,Action:"download_file",Args:map[string]any{"id":"user-exact-id"},Text:"Descarga este documento de Drive y comprueba el archivo real."}
}

func TestLexOpenStagedFileTaskWorksWithoutCallingHallucinatingModel(t *testing.T){
	s,d,brain,file,id,body:=stagedChatFixture(t);brain.replies=[]string{"Ya descargué un PDF de cinco páginas"}
	first,err:=s.StageFileAction(context.Background(),id,body);if err!=nil||first.State!="pending"||file.calls!=0||len(brain.seen)!=0{t.Fatal("staging asked the model or executed before approval")}
	repeat,err:=s.StageFileAction(context.Background(),id,body);if err!=nil||repeat.ApprovalID!=first.ApprovalID{t.Fatal("retry duplicated approval")}
	sess,_:=s.Get(id);if len(sess.Turns)!=2||sess.Turns[0].From!="user"||sess.Turns[0].Text!=body.Text||sess.Turns[0].FileRequestID!=body.RequestID{t.Fatal("original native user turn missing or repeated")}
	ap,err:=s.DecideApproval(context.Background(),first.ApprovalID,true,"",false);if err!=nil{t.Fatal(err)}
	r:=ap.StructuredReceipt;hash:=sha256.Sum256(file.data)
	if r==nil||r.State!="desktop_verified"||r.RequestID!=body.RequestID||r.ChatID!=id||r.Connector!=body.Connector||r.Bytes!=len(file.data)||r.SHA256!=hex.EncodeToString(hash[:])||r.FirstLine!="Primera línea jurídica"||r.Pages!=nil||r.Target["id"]!="user-exact-id"{t.Fatal("receipt did not reflect exact local bytes and scope")}
	if file.calls!=1||d.calls!=2||len(brain.seen)!=0{t.Fatal("download was repeated or delegated to model")}
	if _,err=s.DecideApproval(context.Background(),first.ApprovalID,true,"",false);err==nil||file.calls!=1{t.Fatal("approval replayed")}
	repeat,err=s.StageFileAction(context.Background(),id,body);if err!=nil||repeat.State!="desktop_verified"||file.calls!=1{t.Fatal("completed request was replayed")}
}

func TestLexOpenStagedFileRejectsForeignAndMalformedTargetsWithoutAsking(t *testing.T){
	for _,change:=range []func(*StagedFileAction){
		func(b *StagedFileAction){b.Connector="altazor-google-fedcba9876543210"},
		func(b *StagedFileAction){b.Kitty="b1"},func(b *StagedFileAction){b.Action="delete_file"},
		func(b *StagedFileAction){b.Args=map[string]any{"id":"../escape"}},
		func(b *StagedFileAction){b.Args=map[string]any{"id":"valid","token":"not-allowed"}},
		func(b *StagedFileAction){b.Args=map[string]any{"id":"valid","action":"download_file"}},
		func(b *StagedFileAction){b.Text=strings.Repeat("x",16001)},
	}{s,_,brain,file,id,body:=stagedChatFixture(t);change(&body);if _,err:=s.StageFileAction(context.Background(),id,body);err==nil{t.Fatal("invalid target accepted")};list,_:=s.ListApprovals("");if len(list)!=0||file.calls!=0||len(brain.seen)!=0{t.Fatal("invalid input had effects")}}
}

func TestLexOpenStagedFileConflictsAndCrossChatIsolation(t *testing.T){
	s,_,_,_,id,body:=stagedChatFixture(t);first,_:=s.StageFileAction(context.Background(),id,body)
	changed:=body;changed.Args=map[string]any{"id":"other-target"};if _,err:=s.StageFileAction(context.Background(),id,changed);!errors.Is(err,ErrAsyncConflict){t.Fatal("same identifier accepted another target")}
	secondChat,_:=s.Create("Second synthetic chat",[]string{body.Kitty});second,err:=s.StageFileAction(context.Background(),secondChat.ID,body);if err!=nil||second.ApprovalID==first.ApprovalID{t.Fatal("reused foreign chat approval")}
}

func TestLexOpenStagedFileFailureAndTamperingNeverProduceReceipt(t *testing.T){
	for _,mode:=range []string{"transfer","tamper","provider"}{s,d,_,file,id,body:=stagedChatFixture(t);d.fail=mode=="transfer";d.tamper=mode=="tamper";file.fail=mode=="provider";staged,err:=s.StageFileAction(context.Background(),id,body);if err!=nil{t.Fatal(err)};ap,err:=s.DecideApproval(context.Background(),staged.ApprovalID,true,"",false);if err!=nil{t.Fatal(err)};if ap.StructuredReceipt!=nil||ap.Error==""||strings.Contains(ap.Error,"untrusted"){t.Fatal("unverified file had success evidence or leaked provider error")};got,_:=s.StageFileAction(context.Background(),id,body);if got.State!="failed"||file.calls!=1{t.Fatal("failed operation was retried")}}
}

func TestLexOpenStagedFileConcurrentRetryAndCurrentScope(t *testing.T){
	s,d,_,file,id,body:=stagedChatFixture(t);var wg sync.WaitGroup;ids:=make(chan string,8)
	for i:=0;i<8;i++{wg.Add(1);go func(){defer wg.Done();r,err:=s.StageFileAction(context.Background(),id,body);if err==nil{ids<-r.ApprovalID}}()};wg.Wait();close(ids);first:="";count:=0;for id:=range ids{count++;if first==""{first=id};if id!=first{t.Fatal("concurrent retry duplicated approval")}};if count!=8{t.Fatal("concurrent retry failed")}
	k,_:=d.Get(body.Kitty);k.Connectors=[]string{"-"};if _,err:=s.DecideApproval(context.Background(),first,true,"",false);err==nil||file.calls!=0{t.Fatal("removed account was still executable")}
}

func TestLexOpenStagedFileBusyAndMissingTurnPersistenceStayUnexecutable(t *testing.T){
	s,_,_,file,id,body:=stagedChatFixture(t)
	s.mu.Lock();s.sessions[id].Turns=[]Turn{{From:"fixture",Working:true}};s.mu.Unlock();if _,err:=s.StageFileAction(context.Background(),id,body);!errors.Is(err,ErrBusy){t.Fatal("busy desktop accepted staged work")}
	s.mu.Lock();s.sessions[id].Turns=nil;s.mu.Unlock()
	// Refuse the atomic chat replacement after the approval reservation.
	path:=filepath.Join(s.dir,id+".json");if err:=os.Remove(path);err!=nil{t.Fatal(err)};if err:=os.Mkdir(path,0700);err!=nil{t.Fatal(err)}
	if _,err:=s.StageFileAction(context.Background(),id,body);err==nil{t.Fatal("failed native turn persistence reported success")}
	list,_:=s.ListApprovals("");if len(list)!=1||list[0].FileStageReady{t.Fatal("incomplete staged request became ready")}
	if _,err:=s.DecideApproval(context.Background(),list[0].ID,true,"",false);err==nil||file.calls!=0{t.Fatal("incomplete stage executed")}
}

func TestLexOpenStagedFilePDFPagesComeFromVerifiedLocalPDF(t *testing.T){
	if err:=exec.Command("python3","-I","-c","import pypdf").Run();err!=nil{t.Skip("pypdf is required for the synthetic PDF inspection test")}
	data,err:=exec.Command("python3","-I","-c","import io,sys;from pypdf import PdfWriter;w=PdfWriter();[w.add_blank_page(width=612,height=792) for _ in range(3)];b=io.BytesIO();w.write(b);sys.stdout.buffer.write(b.getvalue())").Output();if err!=nil{t.Fatal(err)}
	s,_,brain,file,id,body:=stagedChatFixture(t);file.data=data
	staged,err:=s.StageFileAction(context.Background(),id,body);if err!=nil{t.Fatal(err)};ap,err:=s.DecideApproval(context.Background(),staged.ApprovalID,true,"",false);if err!=nil{t.Fatal(err)}
	if ap.StructuredReceipt==nil||ap.StructuredReceipt.Pages==nil||*ap.StructuredReceipt.Pages!=3||ap.StructuredReceipt.FirstLine!=""||len(brain.seen)!=0{t.Fatal("PDF pages came from model output rather than local inspection")}
}

func TestLexOpenStagedFileInspectorRejectsSymlinksAndInvalidLocalEvidence(t *testing.T){
	root:=t.TempDir();data:=[]byte("Exact real bytes\n");writer:=&lexopenLocalWriter{}
	path,err:=lexopenWriteDownload(context.Background(),writer,"owned",root,"fixture.txt",data);if err!=nil{t.Fatal(err)}
	verified,err:=lexopenInspectFile(context.Background(),writer,"owned",root,"fixture.txt",data);if err!=nil||verified.FirstLine!="Exact real bytes"{t.Fatal("real local bytes not inspected")}
	if err=os.Remove(path);err!=nil{t.Fatal(err)};outside:=filepath.Join(t.TempDir(),"outside.txt");os.WriteFile(outside,data,0600);if err=os.Symlink(outside,path);err!=nil{t.Fatal(err)}
	if _,err=lexopenInspectFile(context.Background(),writer,"owned",root,"fixture.txt",data);err==nil{t.Fatal("inspector followed file symlink")}
	if _,err=lexopenInspectFile(context.Background(),writer,"owned",root,"fixture.txt",make([]byte,(4<<20)+1));err==nil{t.Fatal("inspector accepted oversized data")}
	// Receipt is structured JSON; source text cannot escape into extra fields.
	raw,_:=json.Marshal(verified);var result map[string]any;if json.Unmarshal(raw,&result)!=nil||result["sha256"]==nil{t.Fatal("invalid structured local metadata")}
}
