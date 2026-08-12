-- Fail-closed default for firm-level Hermes/LLM demo in production Hosts.
ALTER TABLE "FirmSettings" ALTER COLUMN "hermesAllowDemo" SET DEFAULT false;
UPDATE