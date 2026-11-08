import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PINNED_COMMIT } from "./harden-connectors.mjs";
const templates=join(dirname(fileURLToPath(import.meta.url)),"patches");
const originals={
  "internal/chat/chat.go": "ab2750d31ba33685601f033f3a9548e16fe85a5a9ce3ecb622d1ef3c690a7c10",
  "internal/chat/actions.go": "5c398841096f6fd134ba6f3ffe748d7fe48f2e0bd7349e19abe443e420a50841",
  "internal/chat/approve.go": "c6d34eef5a76871867cd43098f8c813987593be37e41a138a462107559c65de8",
  "internal/approvals/approvals.go": "2e7c50219542efcdae972f8e7dd9be6f95fba8504d1ddcdcb381c3126d67a846",
  "internal/gateway/gateway.go": "45337a1dc478014a96a4772fa710fcad1adab49c26e67f1bea0d904f9f84aa4a",
  "internal/gateway/approvals.go": "b7d5a2cd425ad06f8807f158a070f369164ae91219c075e0742654f2366ca9f4"
};
const changes={
 "internal/chat/chat.go":[
  ['type Session struct {','type Session struct {\n ComputerPolicy *ComputerPolicyState `json:"lexopen_computer_use_policy,omitempty"`\n ComputerExecution *ComputerExecutionReceipt `json:"lexopen_computer_execution,omitempty"`'],
  ['type Service struct {','type Service struct {\n computerMu sync.Mutex\n computerWaiting map[string]*computerWait'],
  ['if hasDesktopAction(actions) {','if hasDesktopAction(actions)||s.lexopenManagedMachine(id,k,actions) {'],
  ['if a.kind != "tool" {\n\t\t\t\t\tpre[i]', 'if a.kind != "tool" && !(a.kind == "machine" && s.lexopenManagedComputer(id,k)) {\n\t\t\t\t\tpre[i]'],
  ['\t\tfor i, a := range st.actions {','\t\tfor i, a := range st.actions {\n if a.kind=="machine"&&s.lexopenManagedComputer(id,k){a.kind="tool";a.name="machine"}'],
  ['\t\t\tda := desktop.Action{Name: a.name, Args: a.args, Raw: a.raw}','\t\t\tda := desktop.Action{Name: a.name, Args: a.args, Raw: a.raw}\n if s.lexopenManagedComputer(id,k){if _,e:=desktop.ClassifyComputerUse(da,desktop.ComputerUsePolicy{});e!=nil{s.appendStep(id,index,Step{At:s.now(),Action:a.name,Args:a.args,Error:e.Error()});outs=append(outs,outcome{action:a,err:e.Error()});continue}}'],
  ['\t\t\tif err := s.ensureMachine(ctx, id, index, k); err != nil {','\t\t\tif err := func()error{if s.lexopenManagedComputer(id,k){return nil};return s.ensureMachine(ctx,id,index,k)}(); err != nil {'],
  ['\t\t\tout, err := desktop.Run(ctx, runner, k.ID, da)','\t\t\tout, err := s.lexopenRunComputer(ctx,id,index,k,da)'],
  ['\t\t\touts = append(outs, o)\n\t\t\ts.appendStep(id, index, step)\n\t\t\tif ctx.Err() != nil {','\t\t\touts = append(outs, o)\n\t\t\ts.appendStep(id, index, step)\n if err!=nil&&strings.HasPrefix(err.Error(),"computer-use:"){return err.Error(),false}\n\t\t\tif ctx.Err() != nil {'],
  ['\tif st.final != "" {','\tif fail!=""&&s.lexopenManagedComputer(id,k){s.closeTask(id,index,k,fail,!errors.Is(ctx.Err(),context.Canceled),"blocked");return}\n\tif st.final != "" {'],
 ],
 "internal/chat/actions.go":[
  ['\tfor _, a := range actions {\n\t\tswitch a.kind {','\tfor _, a := range actions {\n if s.lexopenManagedComputer(id,k)&&(a.kind=="delegate"||a.kind=="machine"){out=append(out,outcome{action:a,err:"computer-use: this action must run through the bound desktop action gate"});continue}\n\t\tswitch a.kind {'],
 ],
 "internal/chat/approve.go":[
  ['func (s *Service) DecideApproval(ctx context.Context, id string, approve bool, reason string, always bool) (*approvals.Approval, error) {','func (s *Service) DecideApproval(ctx context.Context, id string, approve bool, reason string, always bool) (*approvals.Approval, error) {\n if s.approvals!=nil{if ap,e:=s.approvals.Get(id);e==nil&&(ap.Kind==approvals.ComputerKind||ap.Connector==approvals.ComputerConnector||ap.ComputerAction!=nil){return nil,approvals.ErrComputerApproval}}'],
 ],
 "internal/approvals/approvals.go":[
  ['type Approval struct {','type Approval struct {\n ComputerAction *ComputerActionBinding `json:"computer_action,omitempty"`\n ComputerResult *ComputerActionResult `json:"computer_result,omitempty"`'],
 ],
 "internal/gateway/gateway.go":[
  ['\ts.mux.Handle("POST /v1/lexopen/chats/{id}/file-actions", api(s.handleLexopenStageFile))','\ts.mux.Handle("POST /v1/lexopen/chats/{id}/file-actions", api(s.handleLexopenStageFile))\n s.mux.Handle("GET /v1/lexopen/chats/{id}/computer-policy",api(s.handleComputerPolicy))\n s.mux.Handle("PUT /v1/lexopen/chats/{id}/computer-policy",api(s.handleComputerPolicy))'],
  ['\tif err != nil {\n\t\tout["containers_error"] = err.Error()', '\tif _,ok:=s.chats.(computerPolicyChats);ok&&s.approver!=nil{out["lexopen_computer_use_policy"]="v1"}\n\tif err != nil {\n\t\tout["containers_error"] = err.Error()'],
 ],
 "internal/gateway/approvals.go":[
  ['"github.com/madkoding/kitties/internal/approvals"','"github.com/madkoding/kitties/internal/approvals"\n "github.com/madkoding/kitties/internal/chat"'],
  ['\t\tReason string `json:"reason"`','\t\tReason string `json:"reason"`\n Computer *chat.ComputerApprovalClaim `json:"computer,omitempty"`'],
  ['\tap, err := s.approver.DecideApproval(r.Context(), r.PathValue("id"), approve, body.Reason, body.Always)','\tvar ap *approvals.Approval;var err error\n if body.Computer!=nil{controller,ok:=s.chats.(computerPolicyChats);if !ok||!s.computerPolicyAllowed(r){computerPolicyError(w,403);return};ap,err=controller.DecideComputerUseApproval(r.Context(),r.PathValue("id"),approve,body.Reason,body.Always,*body.Computer)}else{ap,err=s.approver.DecideApproval(r.Context(),r.PathValue("id"),approve,body.Reason,body.Always)}'],
 ],
};
const additions=[
 ["internal/desktop/lexopen_computer_use.go","computer-use-desktop.go"],["internal/desktop/lexopen_computer_use_test.go","computer-use-desktop_test.go"],
 ["internal/approvals/lexopen_computer_use.go","computer-use-approvals.go"],["internal/approvals/lexopen_computer_use_test.go","computer-use-approvals_test.go"],
 ["internal/chat/lexopen_computer_use.go","computer-use-chat.go"],["internal/chat/lexopen_computer_use_test.go","computer-use-chat_test.go"],
 ["internal/gateway/lexopen_computer_use.go","computer-use-gateway.go"],["internal/gateway/lexopen_computer_use_test.go","computer-use-gateway_test.go"],
];
const hash=value=>createHash("sha256").update(value).digest("hex");
export function rewriteComputerUsePolicy(path,source){if(!changes[path])throw new Error("Not a pinned computer-use source");for(const[before,after]of changes[path]){if(!source.includes(before)||source.indexOf(before)!==source.lastIndexOf(before))throw new Error("Pinned computer-use source no longer matches: "+path);source=source.replace(before,after)}return source}
export async function hardenComputerUsePolicy(directory){
 const root=await realpath(directory);if((await readFile(join(root,".lexopen-source-commit"),"utf8")).trim()!==PINNED_COMMIT||(await readFile(join(root,".lexopen-cloud-file-oauth"),"utf8")).trim()!=="v1")throw new Error("Computer-use policy requires the exact Go10 source");
 if(await lstat(join(root,".lexopen-computer-use-policy")).catch(e=>{if(e.code==="ENOENT")return null;throw e}))throw new Error("Computer-use policy already applied");if(Object.keys(originals).length!==Object.keys(changes).length)throw new Error("Incomplete pinned computer-use manifest");const pending=[];
 for(const[path,expected]of Object.entries(originals)){const file=join(root,path),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||await realpath(file)!==file)throw new Error("Computer-use sources must be regular files");const source=await readFile(file,"utf8");if(hash(source)!==expected)throw new Error("Pinned computer-use source differs: "+path);pending.push([file,rewriteComputerUsePolicy(path,source)])}
 for(const[target,template]of additions){const file=join(root,target);if(await realpath(dirname(file))!==dirname(file))throw new Error("Computer-use addition directory must not be a symlink");if(await lstat(file).catch(e=>{if(e.code==="ENOENT")return null;throw e}))throw new Error("Computer-use addition already exists");pending.push([file,await readFile(join(templates,template),"utf8")])}
 for(const[file,source]of pending)await writeFile(file,source,{mode:0o600});await writeFile(join(root,".lexopen-computer-use-policy"),"v1\n",{flag:"wx",mode:0o600});return{source:PINNED_COMMIT,computerUsePolicy:"v1",files:pending.length}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw new Error("Usage: node scripts/altazor/harden-computer-use-policy.mjs <Go10-source>");console.log(JSON.stringify(await hardenComputerUsePolicy(process.argv[2])))}
