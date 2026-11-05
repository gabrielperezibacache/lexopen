import type { ConnectorKindId } from "./catalog";

export type ConnectorField = { name: string; label: string; help?: string; secret: boolean; required: boolean; key?: string };
export type ConnectorCatalogEntry = { id: ConnectorKindId; label: string; category: string; description: string; platform: "macos-host" | "gateway"; oauth: string; oauthReady: boolean; fieldNames: readonly string[]; actions: readonly string[]; source: string; fields: ConnectorField[]; available: boolean; blockedReason?: string };
export type ConnectorConnection = { name: string; kind: ConnectorKindId; signedIn: boolean; needsSignIn: boolean; configured: boolean; ownAppConfigured: boolean; secretFields: string[]; auth: string | null; usedBy: string[] };
export type ConnectorInventory = { catalog: ConnectorCatalogEntry[]; connections: ConnectorConnection[]; gateReady: boolean; version: string };
export type ConnectorConfiguration = { kind: ConnectorKindId; settings: Record<string, string>; signIn?: boolean; clear?: string[] };
export type ConnectorApproval = { id: string; kittyId: string; chatId: string; connector: string; kind: ConnectorKindId; action: string; summary: string; args: Record<string, unknown>; reviewable: boolean; at: string; status: "pending" };
