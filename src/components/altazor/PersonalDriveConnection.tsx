"use client";
import { useCallback,useEffect,useState } from "react";
import { Cloud,ExternalLink } from "lucide-react";
import styles from "./PersonalDriveConnection.module.css";
import { withCsrfHeaders } from "@/lib/client-csrf";
type Status={connected:boolean;configured:boolean;label:string;email:string|null;connectionId:string|null;reason:string|null;lastVerifiedAt:string|null;canAdmin:boolean};
type Setup={configured:boolean;source:string;canEdit:boolean;callbackUri:string|null;callbackPath:string;reason:string|null;registrationUrl:string};
async function request<T>(path:string,body?:unknown,method="POST"):Promise<T>{const response=await fetch(`/api/personal-connectors/google-drive${path}`,{method:body===undefined?"GET":method,headers:body===undefined?undefined:withCsrfHeaders({"Content-Type":"application/json"}),body:body===undefined?undefined:JSON.stringify(body),cache:"no-store"}),value=await response.json();if(!response.ok)throw Error(value.error||"No se pudo completar la conexión");return value;}
/** Direct content consent is independent of the computer's metadata connector. */
export function PersonalDriveConnection({onChange}:{onChange?:()=>void}){
  const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false),[connectOpen,setConnectOpen]=useState(false),[attempt,setAttempt]=useState<{id:string;expiresAt:string}|null>(null),[authUrl,setAuthUrl]=useState(""),[disconnectOpen,setDisconnectOpen]=useState(false),[setup,setSetup]=useState<Setup|null>(null),[alias,setAlias]=useState(false),[clientId,setClientId]=useState(""),[clientSecret,setClientSecret]=useState(""),[setupConfirmed,setSetupConfirmed]=useState(false);
  const reload=useCallback(async()=>{const value=await request<Status>("");setStatus(value);return value;},[]);
  useEffect(()=>{let active=true;void request<Status>("").then(value=>{if(active)setStatus(value);}).catch(reason=>{if(active)setError(reason.message);});return()=>{active=false;};},[]);
  useEffect(()=>{
    if(!attempt)return;const controller=new AbortController();let polling=false;
    const timer=setInterval(()=>{if(polling||controller.signal.aborted)return;if(Date.now()>new Date(attempt.expiresAt).getTime()){setAttempt(null);setError("El intento venció. Puedes volver a conectar tu cuenta.");return;}polling=true;
      void request<Status&{complete:boolean;pending?:boolean}>("/oauth/complete",{attemptId:attempt.id}).then(value=>{if(controller.signal.aborted||!value.complete)return;setAttempt(null);setStatus(value);setAuthUrl("");setConnectOpen(false);setConsent(false);setNotice(value.connected?"Cuenta de Google conectada. Ahora elige las carpetas que quieres usar.":"Revisa el estado de tu cuenta antes de elegir carpetas.");onChange?.();}).catch(reason=>{if(!controller.signal.aborted){setAttempt(null);setError(reason.message);}}).finally(()=>{polling=false;});
    },5000);return()=>{controller.abort();clearInterval(timer);};
  },[attempt,onChange]);
  async function start(){if(!consent)return;setBusy(true);setError("");setNotice("");const popup=window.open("about:blank","_blank","popup,width=620,height=760");if(popup)popup.opener=null;
    try{const value=await request<{attemptId:string;authUrl:string;expiresAt:string}>("/oauth/start",{requestId:crypto.randomUUID(),confirmed:true}),url=new URL(value.authUrl);if(url.protocol!=="https:"||url.hostname!=="accounts.google.com")throw Error("No se pudo abrir la página oficial de Google");setAttempt({id:value.attemptId,expiresAt:value.expiresAt});setAuthUrl(value.authUrl);if(popup)popup.location.href=value.authUrl;}
    catch(reason){popup?.close();setError(reason instanceof Error?reason.message:"No se pudo iniciar la conexión");}finally{setBusy(false);}
  }
  async function disconnect(){setBusy(true);setError("");try{setStatus(await request<Status>("",{},"DELETE"));setAttempt(null);setAuthUrl("");setDisconnectOpen(false);setNotice("Cuenta desconectada de LexOpen. Las actualizaciones personales se pausaron y tus copias se conservan.");onChange?.();}catch(reason){setError(reason instanceof Error?reason.message:"No se pudo desconectar");}finally{setBusy(false);}}
  async function loadSetup(){setError("");try{const value=await request<Setup>("/setup");setAlias(value.source==="altazor");setSetup(value);}catch(reason){setError(reason instanceof Error?reason.message:"No se pudo abrir la configuración");}}
  async function saveSetup(){setBusy(true);setError("");try{const prepared=await request<Setup>("/setup",{useAltazorApp:alias,...(alias?{}:{clientId,clientSecret}),confirmed:true},"PUT");setSetup(prepared);setClientSecret("");if(!prepared.configured){await reload();throw Error(prepared.reason||"Complete la aplicación de Google antes de conectar cuentas.");}setSetupConfirmed(false);await reload();setNotice("Aplicación preparada. Cada profesional puede conectar su propia cuenta.");}catch(reason){setError(reason instanceof Error?reason.message:"No se pudo guardar la configuración");}finally{setBusy(false);}}
  return <section className={styles.root} aria-label="Mi cuenta de Google Drive">
    <div className={styles.heading}>
      <div className={styles.identity}>
        <Cloud size={22} className={styles.icon} aria-hidden="true" />
        <div>
          <h3>Mi Google Drive</h3>
          {status?.connected && <p>{status.email || status.label}</p>}
        </div>
      </div>
      {status?.connected
        ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>setDisconnectOpen(!disconnectOpen)}>Desconectar</button>
        : status?.configured && <button type="button" className="btn btn-outline" disabled={busy||Boolean(attempt)} onClick={()=>setConnectOpen(!connectOpen)}>{attempt?"Esperando a Google…":"Conectar con Google"}</button>}
    </div>
    {error&&<p role="alert" className="altazor-error">{error}</p>}{notice&&<p role="status" className="altazor-notice">{notice}</p>}
    {status && !status.connected && <p className="altazor-muted">{status.reason || "Conecta tu cuenta y elige las carpetas de trabajo."}</p>}
    {connectOpen&&!status?.connected&&<div className="altazor-send-settings"><p>Google concederá permiso para ver y descargar los archivos de tu Drive. LexOpen utilizará las carpetas que elijas; esta conexión no permite modificar ni borrar archivos.</p><label><input type="checkbox" checked={consent} disabled={Boolean(attempt)} onChange={event=>setConsent(event.target.checked)}/>Autorizo este acceso de lectura y su renovación para actualizar mis carpetas mientras LexOpen esté disponible.</label><button type="button" className="btn btn-primary" disabled={!consent||busy||Boolean(attempt)} onClick={()=>void start()}>{busy?"Abriendo Google…":"Iniciar sesión en Google"}</button>{authUrl&&<a href={authUrl} target="_blank" rel="noopener noreferrer">Continuar en la página oficial de Google <ExternalLink size={15}/></a>}{attempt&&<p role="status">Completa el ingreso en Google. LexOpen terminará la conexión aquí automáticamente.</p>}</div>}
    {disconnectOpen&&<div className="altazor-send-settings"><p>Se retirará el acceso guardado en LexOpen y se pausarán tus carpetas personales. Tus documentos ya conservados seguirán disponibles.</p><button type="button" className="btn btn-outline" disabled={busy} onClick={()=>void disconnect()}>Sí, desconectar mi cuenta</button><button type="button" className="btn btn-ghost" onClick={()=>setDisconnectOpen(false)}>Conservar conexión</button><a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">Gestionar también los permisos en Google</a></div>}
    {status?.connected&&<p className="altazor-muted">Acceso de lectura{status.lastVerifiedAt?` · comprobado el ${new Date(status.lastVerifiedAt).toLocaleDateString("es-CL")}`:""}. Tú eliges qué archivos se conservan en LexOpen y cuáles compartes con la IA.</p>}
    {status?.canAdmin && <details className={styles.setup} onToggle={event=>{if(event.currentTarget.open&&!setup)void loadSetup();}}>
      <summary>{status.configured?"Configuración de la conexión":"Preparar conexión para el estudio"}</summary>
      {setup && <div className="altazor-send-settings">
        <ol className={styles.steps}>
          <li><a href={setup.registrationUrl} target="_blank" rel="noopener noreferrer">Abrir Google Cloud <ExternalLink size={15} aria-hidden="true" /></a> Registra un cliente OAuth de tipo «Aplicación web» y habilita la API de Drive con permiso de lectura.</li>
          <li>Añade esta dirección en «URI de redireccionamiento autorizados».
            <code>{setup.callbackUri||`${window.location.origin}${setup.callbackPath}`}</code>
          </li>
        </ol>
        {setup.canEdit && <>
          <label><input type="checkbox" checked={alias} onChange={event=>setAlias(event.target.checked)}/>Reutilizar la aplicación de Google preparada para Altazor</label>
          {!alias && <>
            <label>ID de cliente de Google<input value={clientId} autoComplete="off" onChange={event=>setClientId(event.target.value)} maxLength={1000}/></label>
            <label>Secreto de cliente de Google<input type="password" value={clientSecret} autoComplete="new-password" onChange={event=>setClientSecret(event.target.value)} maxLength={4000}/></label>
          </>}
          <label><input type="checkbox" checked={setupConfirmed} onChange={event=>setSetupConfirmed(event.target.checked)}/>Registré la dirección y el permiso de lectura en Google. Después, cada profesional podrá autorizar su cuenta.</label>
          <button type="button" className="btn btn-outline" disabled={busy||!setupConfirmed||!alias&&(!clientId||!clientSecret)} onClick={()=>void saveSetup()}>Guardar preparación</button>
        </>}
      </div>}
    </details>}
  </section>;
}
