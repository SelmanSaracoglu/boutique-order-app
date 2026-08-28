CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,

  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',

  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT users_username_unique
    UNIQUE (username),

  CONSTRAINT users_username_not_blank
    CHECK (btrim(username) <> ''),

  CONSTRAINT users_username_length
    CHECK (char_length(username) BETWEEN 3 AND 64),

  CONSTRAINT users_username_lowercase
    CHECK (username = lower(username)),

  CONSTRAINT users_username_format
    CHECK (username ~ '^[a-z0-9][a-z0-9._-]*$'),

  CONSTRAINT users_password_hash_argon2id
    CHECK (password_hash LIKE '$argon2id$%'),

  CONSTRAINT users_role_valid
    CHECK (
      role IN (
        'ADMIN',
        'ORDER_OPERATOR',
        'PAYMENT_OPERATOR',
        'FULFILLMENT_OPERATOR'
      )
    ),

  CONSTRAINT users_status_valid
    CHECK (status IN ('ACTIVE', 'DISABLED')),

  CONSTRAINT users_session_version_positive
    CHECK (session_version > 0)
);