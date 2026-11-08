"use client";
import { createContext, Suspense, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Sheet } from "@/components/ui/Sheet";
import { AltazorMark } from "./AltazorMark";
import { AltazorHome } from "./AltazorHome";
import { useAltazorUpdates } from "./AltazorUpdates";
import { useAltazorCompanionState } from "./useAltazorCompanionState";
import { useAltazorHelpReconciliation } from "./useAltazorHelpReconciliation";
import "./AltazorCompanion.css";

type CompanionState = ReturnType<typeof useAltazorCompanionState> & { updates: ReturnType<typeof useAltazorUpdates>; reconcileHelp: () => Promise<unknown> };
const Context = createContext<CompanionState | null>(null);
export function useAltazorCompanion() {
  const state = useContext(Context);
  if (!state) throw new Error("ALTAZOR requiere su proveedor de usuario");
  return state;
}

/** One state owner survives route changes; the user key prevents cross-account reuse. */
export function AltazorCompanionProvider({ userId, children }: { userId: string; children: ReactNode }) {
  return <UserCompanion key={userId}>{children}</UserCompanion>;
}
function UserCompanion({ children }: { children: ReactNode }) {
  const state = useAltazorCompanionState(), updates = useAltazorUpdates(), pathname = usePathname();
  const reconcile = useAltazorHelpReconciliation();
  const atHome = pathname === "/inicio";
  return <Context.Provider value={{ ...state, updates, reconcileHelp: () => reconcile(true) }}><Suspense fallback={null}><CompanionLocationObserver /></Suspense>{children}{!atHome && <CompanionPanel key={pathname} />}</Context.Provider>;
}
/** Observe query changes without making the conversation UI depend on a prerendered URL. */
function CompanionLocationObserver(){
  const state=useAltazorCompanion(),pathname=usePathname(),search=useSearchParams().toString(),synchronize=useRef(state.synchronizeLocation);
  useEffect(()=>{synchronize.current=state.synchronizeLocation;},[state.synchronizeLocation]);
  useEffect(()=>synchronize.current(pathname,search),[pathname,search,state.loading,state.activeId]);
  return null;
}
function CompanionPanel() {
  const state = useAltazorCompanion(), [open,setOpen] = useState(false);
  const running = state.data?.turns.some(turn => ["queued", "running", "delegating"].includes(turn.status));
  const params=new URLSearchParams();if(state.activeId)params.set("conversacion",state.activeId);else if(state.scope)params.set("causaId",state.scope);
  const homeHref=`/inicio${params.size?`?${params}`:""}`;
  return <>
    <button type="button" className="altazor-companion-launcher" onClick={() => setOpen(true)} aria-label="Conversar con ALTAZOR" aria-haspopup="dialog" aria-expanded={open}><AltazorMark size={44} state={running ? "thinking" : "ready"} label /></button>
    <Sheet open={open} onClose={() => setOpen(false)} title="ALTAZOR" className="altazor-companion-sheet" headerActions={<Link href={homeHref} className="btn btn-ghost">Abrir conversación completa</Link>}>{open && <AltazorHome />}</Sheet>
  </>;
}
