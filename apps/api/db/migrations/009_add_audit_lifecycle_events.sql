ALTER TABLE audit_events
  DROP CONSTRAINT audit_events_action_valid,
  DROP CONSTRAINT audit_events_classification_consistent;

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
        'AUDIT_LOG_VIEWED',
        'APPLICATION_ERROR',
        'AUDIT_LOGGING_STARTED',
        'AUDIT_RETENTION_PURGED'
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
          'ORDER_DETAIL_VIEWED',
          'AUDIT_LOG_VIEWED'
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
        action IN (
          'AUDIT_LOGGING_STARTED',
          'AUDIT_RETENTION_PURGED'
        )
        AND category = 'SYSTEM'
        AND outcome = 'SUCCESS'
        AND severity = 'INFO'
      )
    );

CREATE INDEX audit_events_occurred_at_id_desc_idx
  ON audit_events (occurred_at DESC, id DESC);
