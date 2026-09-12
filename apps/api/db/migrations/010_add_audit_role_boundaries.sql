DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'boutique_app_runtime'
  ) THEN
    CREATE ROLE boutique_app_runtime
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'boutique_audit_retention'
  ) THEN
    CREATE ROLE boutique_audit_retention
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE boutique_app_runtime
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS;

ALTER ROLE boutique_audit_retention
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS;

GRANT boutique_app_runtime
  TO CURRENT_USER
  WITH ADMIN OPTION;

GRANT boutique_audit_retention
  TO CURRENT_USER
  WITH ADMIN OPTION;

GRANT USAGE
  ON SCHEMA public
  TO boutique_app_runtime,
     boutique_audit_retention;

REVOKE ALL PRIVILEGES
  ON ALL TABLES IN SCHEMA public
  FROM boutique_app_runtime,
       boutique_audit_retention;

REVOKE ALL PRIVILEGES
  ON ALL SEQUENCES IN SCHEMA public
  FROM boutique_app_runtime,
       boutique_audit_retention;

REVOKE ALL PRIVILEGES
  ON audit_events
  FROM PUBLIC;

REVOKE ALL PRIVILEGES
  ON SEQUENCE audit_events_id_seq
  FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE
  ON orders
  TO boutique_app_runtime;

GRANT SELECT, INSERT
  ON order_items
  TO boutique_app_runtime;

GRANT SELECT
  ON users
  TO boutique_app_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON user_sessions
  TO boutique_app_runtime;

GRANT SELECT, INSERT
  ON audit_events
  TO boutique_app_runtime;

GRANT USAGE, SELECT
  ON SEQUENCE
    orders_id_seq,
    order_items_id_seq,
    audit_events_id_seq
  TO boutique_app_runtime;

GRANT INSERT, DELETE
  ON audit_events
  TO boutique_audit_retention;

GRANT SELECT (occurred_at)
  ON audit_events
  TO boutique_audit_retention;

GRANT USAGE, SELECT
  ON SEQUENCE audit_events_id_seq
  TO boutique_audit_retention;