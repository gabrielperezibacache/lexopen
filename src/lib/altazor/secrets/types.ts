import type { PrismaClient } from "@prisma/client";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import type { SecretTarget } from "./policy";

export type SecretMetadata = { id: string; name: string; provider: string; username: string | null; kind: string; revision: number; createdAt: string; updatedAt: string };
export type SecretUseGrant = { id: string; secretId: string; revision: number; target: SecretTarget; state: string; expiresAt: string };
export type SecretOptions = { client?: PrismaClient; material?: string; now?: () => number };
/** Verify session, gateway and hold. Origin/field are declared by the person, not DOM-attested. */
export type SecretUseOptions = SecretOptions & {
  verifyTarget: (user: CausaAccessUser, target: SecretTarget) => Promise<void>;
};
