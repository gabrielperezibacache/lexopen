CREATE TABLE "PjudRefreshReservation" (
 "id" TEXT NOT NULL, "scope" TEXT NOT NULL, "slot" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PjudRefreshReservation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PjudRefreshReservation_scope_slot_key" ON "PjudRefreshReservation"("scope", "slot");
CREATE INDEX "PjudRefreshReservation_slot_idx" ON "PjudRefreshReservation"("slot");
-- Retire interval overrides without enabling any paused cause or changing saved judicial data.
UPDATE "Causa" SET "pjudSyncIntervalMinutes" = NULL, "pjudNextSyncAt" = NULL WHERE "pjudMonitoreoActivo" = true;
