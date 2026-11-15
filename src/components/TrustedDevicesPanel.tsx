"use client";
import { useEffect, useRef, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
type Device={id:string;label:string;createdAt:string;lastUsedAt:string;expiresAt:string;current:boolean};
export function TrustedDevicesPanel(){
  const [devices,setDevices]=useState<Device[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[limited,setLimited]=useState(false);
  const mounted=useRef(true),request=useRef<AbortController|null>(null);
  async function refresh(){
    request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError("");
    try{const response=await fetch("/api/auth/devices",{cache:"no-store",signal:controller.signal});if(!response.ok)throw Error();const data=await response.json();if(!controller.signal.aborted){setDevices(data.devices);setLimited(data.limited);}}
    catch{if(!controller.signal.aborted){setDevices([]);setError("No se pudieron consultar los equipos. Vuelva a cargar o inicie sesión de nuevo.");}}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  useEffect(()=>{mounted.current=true;const timer=window.setTimeout(()=>void refresh(),0);return()=>{window.clearTimeout(timer);mounted.current=false;request.current?.abort();};},[]);
  async function revoke(id?:string){
    setBusy(true);setError("");
    const result=await apiMutation("/api/auth/devices",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(id?{action:"revoke",id}:{action:"revoke-all"})});
    if(!mounted.current)return;
    if(!result.ok){setBusy(false);setDevices([]);setError("No se pudo revocar la confianza. Vuelva a cargar y compruebe el estado.");return;}
    await refresh();
  }
  return <section className="card space-y-4 p-5" aria-label="Equipos recordados" aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Equipos recordados</h2><button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>void refresh()}>Actualizar equipos</button></div>
    <p className="text-sm text-[var(--muted)]">Puede recordar un navegador durante 30 días al completar el segundo factor. Al revocar su confianza, el próximo ingreso volverá a pedir 2FA. Las sesiones ya abiertas conservan su duración habitual.</p>
    {error&&<p role="alert">{error}</p>}
    {!busy&&!error&&devices.length===0&&<p>No tiene equipos recordados activos.</p>}
    <ul className="space-y-3">{devices.map(device=><li key={device.id} className="rounded-lg border border-[var(--line)] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><strong>{device.label}{device.current?" · Este navegador":""}</strong><button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>void revoke(device.id)}>Revocar confianza<span className="sr-only"> de {device.label}</span></button></div><p className="mt-2 text-sm">Último ingreso: <time dateTime={device.lastUsedAt}>{new Date(device.lastUsedAt).toLocaleString("es-CL")}</time> · Vence: <time dateTime={device.expiresAt}>{new Date(device.expiresAt).toLocaleDateString("es-CL")}</time></p></li>)}</ul>
    {limited&&<p>Se muestran los 100 equipos más recientes. Puede revocar todos para retirar también los restantes.</p>}
    {devices.length>0&&<button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>void revoke()}>Revocar todos los equipos</button>}
  </section>;
}
