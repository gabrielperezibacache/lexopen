import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canonicalJson } from "@/lib/command-execution";
import { ConnectorError, digest, encryptionKey, unseal } from "../core";
export const PERSONAL_DRIVE_PROVIDER="google-drive-content";
export const PERSONAL_DRIVE_SCOPES=["https://www.googleapis.com/auth/drive.readonly"] as const;
export const PERSONAL_DRIVE_CALLBACK="/api/personal-connectors/google-drive/oauth/callback";
export type DriveOptions={client?:typeof prisma;env?:Readonly<Record<string,string|undefined>>;fetcher?:typeof fetch};
export function driveOrigin(value:string){try{const url=new URL(value);if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||url.protocol!=="https:"&&!(url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname)))throw Error();return url.origin;}catch{throw new ConnectorError("drive_origin_invalid","Abra LexOpen desde su dirección segura configurada.",409);}}
export type PersonalDriveConfig={configured:boolean;clientId:string;clientSecret:string;origin:string;redirectUri:string;binding:string;source:"environment"|"saved"|"altazor"|"none";reason:string|null};
export async function personalDriveConfig(options:DriveOptions={},db:Prisma.TransactionClient=options.client||prisma):Promise<PersonalDriveConfig>{
  const env=options.env||process.env;let clientId=env.PERSONAL_DRIVE_GOOGLE_CLIENT_ID?.trim()||"",clientSecret=env.PERSONAL_DRIVE_GOOGLE_CLIENT_SECRET?.trim()||"",appUrl=env.APP_URL?.trim()||env.NEXT_PUBLIC_APP_URL?.trim()||"",source:PersonalDriveConfig["source"]=clientId||clientSecret?"environment":"none";
  if(source==="none"){
    const row=await db.integrationConfig.findUnique({where:{provider:"personal-drive-oauth"}});
    if(row?.enabled)try{
      const stored=JSON.parse(row.configJson) as {useAltazorApp?:boolean;credentialsEnc?:string;appUrl?:string};
      if(stored.useAltazorApp){
        clientId=env.ALTAZOR_GOOGLE_CLIENT_ID?.trim()||"";clientSecret=env.ALTAZOR_GOOGLE_CLIENT_SECRET?.trim()||"";
        if(!clientId&&!clientSecret){const setup=await db.integrationConfig.findUnique({where:{provider:"altazor-oauth-google"}});if(setup?.enabled){const json=JSON.parse(setup.configJson),saved=unseal<{clientId:string;clientSecret:string;appUrl:string}>(json.credentialsEnc,"altazor:desktop:oauth:operator:google");clientId=saved.clientId;clientSecret=saved.clientSecret;appUrl ||= saved.appUrl;}}
        appUrl ||= stored.appUrl||"";source="altazor";
      }else{const saved=unseal<{clientId:string;clientSecret:string;appUrl:string}>(stored.credentialsEnc||"","google-drive:operator:v1");clientId=saved.clientId;clientSecret=saved.clientSecret;appUrl ||= saved.appUrl;source="saved";}
    }catch{/* A damaged identity never falls back to user or study tokens. */}
  }
  let origin="",reason:string|null="El administrador debe preparar la aplicación de Google una sola vez.";
  try{origin=driveOrigin(appUrl);encryptionKey();if(clientId&&clientSecret&&clientId.length<=1000&&clientSecret.length<=4000&&!/[\r\n]/.test(clientId+clientSecret))reason=null;}catch{/* Explicit blocked setup. */}
  const redirectUri=origin?origin+PERSONAL_DRIVE_CALLBACK:"",binding=digest(canonicalJson({purpose:PERSONAL_DRIVE_PROVIDER,clientId,clientSecret,redirectUri,source}));
  return{configured:reason===null,clientId,clientSecret,origin,redirectUri,binding,source,reason};
}
export function requirePersonalDriveConfig(config:PersonalDriveConfig){if(!config.configured)throw new ConnectorError("drive_unconfigured",config.reason!,503);return config;}
