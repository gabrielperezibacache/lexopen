import { ConnectorError } from "../core";
import { PERSONAL_DRIVE_SCOPES } from "./config";
export async function driveProviderJson(url:string,init:RequestInit,fetcher:typeof fetch=fetch){
  try{
    const response=await fetcher(url,{...init,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15_000)});
    if(!response.ok){await response.body?.cancel();throw Error();}
    const reader=response.body?.getReader();if(!reader)throw Error();let size=0;const chunks:Uint8Array[]=[];
    try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>64*1024){await reader.cancel();throw Error();}chunks.push(part.value);}}finally{reader.releaseLock();}
    const json:unknown=JSON.parse(Buffer.concat(chunks,size).toString("utf8"));if(!json||typeof json!=="object"||Array.isArray(json))throw Error();return json as Record<string,unknown>;
  }catch{throw new ConnectorError("drive_provider_rejected","Google no confirmó el acceso. Vuelva a conectar su cuenta.",502);}
}
export function exactDriveScopes(raw:unknown){if(typeof raw!=="string")return false;const scopes=[...new Set(raw.trim().split(/\s+/))].sort();return scopes.length===PERSONAL_DRIVE_SCOPES.length&&scopes.every((scope,index)=>scope===PERSONAL_DRIVE_SCOPES[index]);}
export function driveToken(raw:unknown){if(typeof raw!=="string"||!raw||raw.length>16000||/[\r\n]/.test(raw))throw new ConnectorError("drive_token_invalid","Google no confirmó una autorización válida.",409);return raw;}
export function driveExpiry(raw:unknown){if(typeof raw!=="number"||!Number.isSafeInteger(raw)||raw<60||raw>86400)throw new ConnectorError("drive_expiry_invalid","Google no confirmó la vigencia de la autorización.",409);return Date.now()+raw*1000;}
export async function driveIdentity(token:string,fetcher?:typeof fetch){
  const response=await driveProviderJson("https://www.googleapis.com/drive/v3/about?fields=user(permissionId,displayName,emailAddress)",{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"}},fetcher);
  const user=response.user as Record<string,unknown>|undefined;
  if(!user||typeof user.permissionId!=="string"||!user.permissionId.trim()||user.permissionId.length>200)throw new ConnectorError("drive_identity_invalid","No se pudo comprobar la cuenta de Drive autorizada.",409);
  return{subject:user.permissionId,name:typeof user.displayName==="string"?user.displayName.slice(0,200):"Mi cuenta de Google",email:typeof user.emailAddress==="string"?user.emailAddress.slice(0,320):null};
}
