package chat

import (
	"context"
	"strings"
	"testing"

	"github.com/madkoding/kitties/internal/provider"
)

type lexopenVisionBrain struct { *toolBrain; vision bool }
func (b *lexopenVisionBrain) SeesImages() bool { return b.vision }
func (b *lexopenVisionBrain) ReadsPDF() bool { return false }

func TestLexOpenInferenceHonoursConfiguredVisionWithoutChangingScreenshots(t *testing.T) {
	original := []provider.Message{{Role:"user",Content:"Read the screen",Images:[]provider.Image{{MIME:"image/png",Data:[]byte("fixture screenshot")}}}}
	for _,vision:=range []bool{false,true}{
		flag:=vision
		brain,err:=provider.New(provider.Options{Kind:"ollama",Model:"fixture",Vision:&flag})
		if err!=nil{t.Fatal(err)}
		filtered:=lexopenInferenceMessages(brain,original)
		if (len(filtered[0].Images)>0)!=vision{t.Fatalf("vision=%v images=%v",vision,filtered[0].Images)}
		if !vision&&!strings.Contains(filtered[0].Content,"read_screen"){t.Fatal("text model did not receive OCR guidance")}
		if len(original[0].Images)!=1||original[0].Content!="Read the screen"{t.Fatal("persisted screenshot or message changed")}
	}
}

func TestLexOpenTextAndNativeInferenceNeverSendImagesToTextModel(t *testing.T) {
	for _,native:=range []bool{false,true}{
		for _,vision:=range []bool{false,true}{
			b:=&lexopenVisionBrain{toolBrain:&toolBrain{replies:[]provider.Reply{{Content:"ok"}}},vision:vision}
			messages:=[]provider.Message{{Role:"user",Content:"monitor capture",Images:[]provider.Image{{MIME:"image/png",Data:[]byte("png")}}}}
			if _,err:=ask(context.Background(),b,native,messages,nil);err!=nil{t.Fatal(err)}
			if len(b.seen)!=1||(len(b.seen[0][0].Images)>0)!=vision{t.Fatalf("native=%v vision=%v incorrect image payload",native,vision)}
			if len(messages[0].Images)!=1{t.Fatal("caller-owned images were removed")}
		}
	}
}

func TestLexOpenDesktopTaskAfterMonitorCaptureKeepsImagesOnlyForVisionModel(t *testing.T) {
	for _,vision:=range []bool{false,true}{
		f,_,_,_:=fleet(t);d:=&deskFleet{fakeFleet:f};s:=service(t,d)
		brain:=&lexopenVisionBrain{vision:vision,toolBrain:&toolBrain{replies:[]provider.Reply{
			{Calls:[]provider.ToolCall{{ID:"open-1",Name:"open",Args:map[string]any{"url":"https://example.invalid"}}}},
			{Calls:[]provider.ToolCall{{ID:"screen-1",Name:"screenshot",Args:map[string]any{}}}},
			{Calls:[]provider.ToolCall{{ID:"done-1",Name:"done",Args:map[string]any{"summary":"Finished fixture task"}}}},
		}}}
		f.brains["a1"]=brain
		sess,err:=s.Create("",[]string{"ana"});if err!=nil{t.Fatal(err)}
		// Polling the monitor remains allowed before the user submits a task.
		if _,err:=d.Screenshot(context.Background(),"a1");err!=nil{t.Fatal(err)}
		if _,err:=s.Send(context.Background(),sess.ID,"Open the fixture page and inspect its screen");err!=nil{t.Fatal(err)}
		got:=waitDone(t,s,sess.ID)
		if got.Turns[1].NeedsHelp||!strings.Contains(got.Turns[1].Text,"Finished fixture task"){t.Fatal("desktop task did not finish")}
		sawImage:=false
		for _,request:=range brain.seen{for _,message:=range request{if len(message.Images)>0{sawImage=true;if !vision{t.Fatal("text model received a desktop image")}}}}
		if sawImage!=vision{t.Fatalf("vision=%v sawImage=%v",vision,sawImage)}
		keptShot:=false
		for _,step:=range got.Turns[1].Steps{if step.Shot!=""{data,err:=s.Shot(sess.ID,step.Shot);if err!=nil||string(data)!="PNGDATA"{t.Fatal("UI screenshot lost")};keptShot=true}}
		if !keptShot{t.Fatal("screenshots are unavailable to the person")}
	}
}
