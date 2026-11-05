import { Suspense } from "react";
import { LegacyAssistantArchive } from "@/components/altazor/LegacyAssistantArchive";
export default function ArchivoCopilotoPage() { return <Suspense fallback={<p role="status">Recuperando conversaciones…</p>}><LegacyAssistantArchive /></Suspense>; }
