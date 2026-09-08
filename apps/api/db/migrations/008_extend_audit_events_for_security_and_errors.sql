ALTER TABLE audit_events
  ADD COLUMN request_id UUID,
  ADD COLUMN operation TEXT,
  ADD COLUMN http_method TEXT,
  ADD COLUMN http_route TEXT,
  ADD COLUMN http_status INTEGER,
  ADD COLUMN reason_code TEXT,
  ADD COLUMN error_code TEXT,
  ADD COLUMN source_ip INET,
  ADD COLUMN user_agent TEXT,
  ALTER COLUMN schema_version SET DEFAULT 2;

ALTER TABLE audit_events
  DROP CONSTRAINT audit_events_action_valid,
  DROP CONSTRAINT audit_events_outcome_valid,
  DROP CONSTRAINT audit_events_actor_type_valid,
  DROP CONSTRAINT audit_events_actor_snapshot_consistent,
  DROP CONSTRAINT audit_events_target_resource_type_valid;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_action_valid
    CHECK (
      action IN (
        'ORDER_CREATED',
        'PAYMENT_REPORTED',
        'PAYMENT_CONFIRMED',
        'ORDER_PROCESSING_STARTED',
        'ORDER_COMPLETED',
        'ORDER_CANCELLED',
        'AUTH_LOGIN_SUCCEEDED',
        'AUTH_LOGIN_FAILED',
        'AUTH_LOGIN_RATE_LIMITED',
        'AUTH_LOGOUT_SUCCEEDED',
        'AUTHENTICATION_REQUIRED',
        'SESSION_REJECTED',
        'AUTHORIZATION_DENIED',
        'CSRF_VALIDATION_FAILED',
        'REQUEST_VALIDATION_FAILED',
        'ORDER_DETAIL_VIEWED',
        'APPLICATION_ERROR',
        'AUDIT_LOGGING_STARTED'
      )
    ),

  ADD CONSTRAINT audit_events_outcome_valid
    CHECK (
      outcome IN (
        'SUCCESS',
        'FAILURE',
        'REJECTED'
      )
    ),

  ADD CONSTRAINT audit_events_actor_type_valid
    CHECK (
      actor_type IN (
        'USER',
        'ANONYMOUS',
        'SYSTEM'
      )
    ),

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
      OR
      (
        actor_type IN ('ANONYMOUS', 'SYSTEM')
        AND actor_user_id IS NULL
        AND actor_username IS NULL
        AND actor_role IS NULL
      )
    ),

  ADD CONSTRAINT audit_events_actor_username_length
    CHECK (
      actor_username IS NULL
      OR char_length(actor_username) <= 64
    ),

  ADD CONSTRAINT audit_events_target_resource_type_valid
    CHECK (
      target_resource_type IN (
        'ORDER',
        'AUTHENTICATION',
        'SESSION',
        'REQUEST',
        'APPLICATION',
        'AUDIT_LOG'
      )
    ),

  ADD CONSTRAINT audit_events_target_resource_id_length
    CHECK (
      char_length(target_resource_id) <= 256
    ),

  ADD CONSTRAINT audit_events_operation_valid
    CHECK (
      operation IS NULL
      OR (
        char_length(operation) <= 64
        AND operation ~ '^[A-Z][A-Z0-9_]*$'
      )
    ),

  ADD CONSTRAINT audit_events_http_method_valid
    CHECK (
      http_method IS NULL
      OR http_method ~ '^[A-Z]{1,16}$'
    ),

  ADD CONSTRAINT audit_events_http_route_valid
    CHECK (
      http_route IS NULL
      OR (
        btrim(http_route) <> ''
        AND char_length(http_route) <= 256
      )
    ),

  ADD CONSTRAINT audit_events_http_status_valid
    CHECK (
      http_status IS NULL
      OR http_status BETWEEN 100 AND 599
    ),

  ADD CONSTRAINT audit_events_reason_code_valid
    CHECK (
      reason_code IS NULL
      OR reason_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
    ),

  ADD CONSTRAINT audit_events_error_code_valid
    CHECK (
      error_code IS NULL
      OR error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
    ),

  ADD CONSTRAINT audit_events_user_agent_valid
    CHECK (
      user_agent IS NULL
      OR (
        char_length(user_agent) <= 256
        AND user_agent !~ '[[:cntrl:]]'
      )
    ),

  ADD CONSTRAINT audit_events_version_two_request_metadata
    CHECK (
      schema_version = 1
      OR (
        request_id IS NOT NULL
        AND operation IS NOT NULL
        AND http_method IS NOT NULL
        AND http_route IS NOT NULL
        AND http_status IS NOT NULL
      )
    ),

  ADD CONSTRAINT audit_events_outcome_code_consistent
    CHECK (
      schema_version = 1
      OR (
        outcome = 'SUCCESS'
        AND reason_code IS NULL
        AND error_code IS NULL
      )
      OR (
        outcome = 'REJECTED'
        AND reason_code IS NOT NULL
        AND error_code IS NULL
      )
      OR (
        outcome = 'FAILURE'
        AND num_nonnulls(reason_code, error_code) = 1
      )
    ),

  ADD CONSTRAINT audit_events_classification_consistent
    CHECK (
      (
        action IN (
          'ORDER_CREATED',
          'PAYMENT_REPORTED',
          'PAYMENT_CONFIRMED',
          'ORDER_PROCESSING_STARTED',
          'ORDER_COMPLETED',
          'ORDER_CANCELLED'
        )
        AND category = 'PRODUCT'
        AND (
          (
            outcome = 'SUCCESS'
            AND severity = 'INFO'
          )
          OR (
            outcome = 'REJECTED'
            AND severity = 'WARN'
          )
        )
      )
      OR (
        action IN (
          'AUTH_LOGIN_SUCCEEDED',
          'AUTH_LOGOUT_SUCCEEDED',
          'ORDER_DETAIL_VIEWED'
        )
        AND category = 'SECURITY'
        AND outcome = 'SUCCESS'
        AND severity = 'INFO'
      )
      OR (
        action = 'AUTH_LOGIN_FAILED'
        AND category = 'SECURITY'
        AND outcome = 'FAILURE'
        AND severity = 'WARN'
      )
      OR (
        action IN (
          'AUTH_LOGIN_RATE_LIMITED',
          'AUTHENTICATION_REQUIRED',
          'SESSION_REJECTED',
          'AUTHORIZATION_DENIED',
          'CSRF_VALIDATION_FAILED'
        )
        AND category = 'SECURITY'
        AND outcome = 'REJECTED'
        AND severity = 'WARN'
      )
      OR (
        action = 'REQUEST_VALIDATION_FAILED'
        AND category = 'SECURITY'
        AND outcome = 'REJECTED'
        AND severity = 'INFO'
      )
      OR (
        action = 'APPLICATION_ERROR'
        AND category = 'ERROR'
        AND outcome = 'FAILURE'
        AND severity IN ('ERROR', 'CRITICAL')
      )
      OR (
        action = 'AUDIT_LOGGING_STARTED'
        AND category = 'SYSTEM'
        AND outcome = 'SUCCESS'
        AND severity = 'INFO'
      )
    ),

  ADD CONSTRAINT audit_events_application_error_server_status
    CHECK (
      action <> 'APPLICATION_ERROR'
      OR (
        http_status BETWEEN 500 AND 599
        AND error_code IS NOT NULL
        AND reason_code IS NULL
      )
    );

CREATE INDEX audit_events_request_id_idx
  ON audit_events (request_id)
  WHERE request_id IS NOT NULL;