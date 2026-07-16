-- TEMPORARY diagnostic: capture login/forgot attempts to pinpoint a live "invalid credentials" issue
-- (what email was submitted, did it match an account, what was the outcome). No passwords stored.
-- Safe to DROP once the auth issue is resolved.
CREATE TABLE IF NOT EXISTS auth_attempt_log (
    id BIGSERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    route TEXT,
    email_attempted TEXT,
    email_len INTEGER,
    account_found BOOLEAN,
    no_password BOOLEAN,
    outcome TEXT
);
