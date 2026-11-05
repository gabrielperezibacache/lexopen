import assert from "node:assert/strict";
import { normalizeAssistantInput } from "./normalize";
import { classifyIntents } from "./classify";
import { explicitWorkflowListing, ruleClassify } from "./classify-rules";
async function main(){
  let calls=0;
  for(const [text,id] of [["Muéstrame mis audiencias de esta causa","audiencia.listar"],["Ver mis escritos","escrito.listar"],["Lista mis trabajos académicos","academia.listar"],["Ver mi biblioteca","biblioteca.listar"],["Estado de sincronización de esta causa","sincronizacion.estado"]]){
    const result=await classifyIntents(normalizeAssistantInput(text),{altazorContext:true,askLlm:async()=>{calls++;throw Error("not allowed");}});
    assert.equal(result.intents[0].toolId,id);assert.equal(result.source,"rule");
  }
  for(const text of ["No muestres mis audiencias","Muestra mis escritos y envía un correo","¿Puedes borrar mis escritos?","Ver mis documentos secretos"])assert.equal(explicitWorkflowListing(normalizeAssistantInput(text)),undefined);
  assert.equal(ruleClassify(normalizeAssistantInput("Guarda la respuesta como escrito titulado Contestación")).intents[0].toolId,"escrito.guardar");
  assert.equal(calls,0);console.log("Native workflow routing: precise local reads, negative/compound exclusion and explicit reviewed writing save passed.");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
