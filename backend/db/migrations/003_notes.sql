-- ============================================================
-- Migration 003: Notes / Reminders / Follow-ups
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     bigint,                              -- author (rep)
    customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    call_id     uuid REFERENCES calls(id) ON DELETE SET NULL,
    title       text NOT NULL,
    body        text,
    note_type   text DEFAULT 'note',                 -- note | reminder | followup
    priority    text DEFAULT 'medium',               -- low | medium | high
    status      text DEFAULT 'open',                 -- open | done | snoozed
    due_date    timestamptz,
    tags        text[] DEFAULT '{}',
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now(),
    completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS notes_user_status_idx ON notes(user_id, status);
CREATE INDEX IF NOT EXISTS notes_due_idx ON notes(due_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS notes_customer_idx ON notes(customer_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION notes_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_updated_at ON notes;
CREATE TRIGGER notes_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION notes_set_updated_at();
