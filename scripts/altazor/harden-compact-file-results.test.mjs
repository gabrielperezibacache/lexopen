import assert from "node:assert/strict";
import { rewriteCompactFileResults } from "./harden-compact-file-results.mjs";

const registry='\tOutput string `json:"output"`\n\tvar out string\n\tvar err error\n\tres.Output = clip(out, 4000)';
const changed=rewriteCompactFileResults("internal/connector/connector.go",registry);
assert.match(changed,/OutputTruncated bool/);assert.match(changed,/lexopenBeginFileOutput/);assert.match(changed,/else \{ res.Output = clip\(out, 4000\) \}/);
assert.match(rewriteCompactFileResults("internal/chat/lexopen_readable_file_results.go","data:=[]rune(res.Output);end:=len(data);truncated:=false"),/truncated:=res.OutputTruncated/);
assert.match(rewriteCompactFileResults("internal/chat/lexopen_connector_file_focus.go","List/search with the native request action; download the selected complete file with download_file."),/Do not list or search first/);
assert.match(rewriteCompactFileResults("internal/chat/lexopen_native_file_actions.go","REQUIRED id comes from the listing."),/official Drive\/Docs link/);
for(const source of ["changed source",registry+"\n"+registry])assert.throws(()=>rewriteCompactFileResults("internal/connector/connector.go",source));
assert.throws(()=>rewriteCompactFileResults("unowned.go",""));
console.log("Compact file result source guards passed");
