ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_schema_version_valid
    CHECK (schema_version > 0),

  ADD CONSTRAINT audit_events_category_valid
    CHECK (
      category IN ('PRODUCT', 'SECURITY', 'ERROR', 'SYSTEM')
    ),

  ADD CONSTRAINT audit_events_action_valid
    CHECK (
      action IN (
        'ORDER_CREATED',
        'PAYMENT_REPORTED',
        'PAYMENT_CONFIRMED',
        'ORDER_PROCESSING_STARTED',
        'ORDER_COMPLETED',
        'ORDER_CANCELLED',
        'AUDIT_LOGGING_STARTED'
      )
    ),

  ADD CONSTRAINT audit_events_outcome_valid
    CHECK (outcome IN ('SUCCESS', 'FAILURE')),

  ADD CONSTRAINT audit_events_severity_valid
    CHECK (severity IN ('INFO', 'WARN', 'ERROR', 'CRITICAL')),

  ADD CONSTRAINT audit_events_actor_type_valid
    CHECK (actor_type IN ('USER', 'SYSTEM')),

  ADD CONSTRAINT audit_events_actor_snapshot_consistent
    CHECK (
      (
        actor_type = 'USER'
        AND actor_user_id IS NOT NULL
        AND actor_user_id > 0
        AND actor_username IS NOT NULL
        AND btrim(actor_username) <> ''
        AND actor_role IS NOT NULL
      )
      OR (
        actor_type = 'SYSTEM'
        AND actor_user_id IS NULL
        AND actor_username IS NULL
        AND actor_role IS NULL
      )
    ),

  ADD CONSTRAINT audit_events_actor_role_valid
    CHECK (
      actor_role IS NULL
      OR actor_role IN (
        'ADMIN',
        'ORDER_OPERATOR',
        'PAYMENT_OPERATOR',
        'FULFILLMENT_OPERATOR'
      )
    ),

  ADD CONSTRAINT audit_events_target_resource_type_valid
    CHECK (target_resource_type IN ('ORDER', 'AUDIT_LOG')),

  ADD CONSTRAINT audit_events_target_resource_id_not_blank
    CHECK (btrim(target_resource_id) <> ''),

  ADD CONSTRAINT audit_events_previous_order_status_valid
    CHECK (
      previous_order_status IS NULL
      OR previous_order_status IN (
        'NEW',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED'
      )
    ),

  ADD CONSTRAINT audit_events_new_order_status_valid
    CHECK (
      new_order_status IS NULL
      OR new_order_status IN (
        'NEW',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED'
      )
    ),

  ADD CONSTRAINT audit_events_previous_payment_status_valid
    CHECK (
      previous_payment_status IS NULL
      OR previous_payment_status IN (
        'AWAITING_PAYMENT',
        'REPORTED',
        'CONFIRMED'
      )
    ),

  ADD CONSTRAINT audit_events_new_payment_status_valid
    CHECK (
      new_payment_status IS NULL
      OR new_payment_status IN (
        'AWAITING_PAYMENT',
        'REPORTED',
        'CONFIRMED'
      )
    ),

  ADD CONSTRAINT audit_events_context_object
    CHECK (jsonb_typeof(context) = 'object');

CREATE UNIQUE INDEX audit_events_logging_started_once_idx
  ON audit_events (action)
  WHERE action = 'AUDIT_LOGGING_STARTED';