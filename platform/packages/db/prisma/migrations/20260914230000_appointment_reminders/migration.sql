-- Visit reminders (24h / 2h before) and the outcome prompt after the visit ends.
ALTER TABLE "appointments"
  ADD COLUMN "reminder_24h_sent_at" TIMESTAMPTZ,
  ADD COLUMN "reminder_2h_sent_at" TIMESTAMPTZ,
  ADD COLUMN "outcome_prompted_at" TIMESTAMPTZ;

CREATE INDEX "appointments_status_starts_at_idx" ON "appointments"("status", "starts_at");
CREATE INDEX "appointments_status_ends_at_idx" ON "appointments"("status", "ends_at");
