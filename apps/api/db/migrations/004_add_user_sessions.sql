CREATE TABLE user_sessions (
  sid VARCHAR NOT NULL,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,

  CONSTRAINT user_sessions_pkey PRIMARY KEY (sid),
  CONSTRAINT user_sessions_sid_not_blank
    CHECK (btrim(sid) <> '')
);

CREATE INDEX user_sessions_expire_idx
  ON user_sessions (expire);

