CREATE TABLE audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

  category TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  severity TEXT NOT NULL,

  actor_type TEXT NOT NULL,
  actor_user_id INTEGER,
  actor_username TEXT,
  actor_role TEXT,

  target_resource_type TEXT NOT NULL,
  target_resource_id TEXT NOT NULL,

  previous_order_status TEXT,
  new_order_status TEXT,
  previous_payment_status TEXT,
  new_payment_status TEXT,

  context JSONB NOT NULL DEFAULT '{}'::jsonb
);