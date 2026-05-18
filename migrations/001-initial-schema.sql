-- Initial schema for Wolf Den consignment portal
-- Creates all required tables, indexes, and constraints

-- Create consignors table
CREATE TABLE IF NOT EXISTS consignors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    square_category_id TEXT NOT NULL,
    payout_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.5000,
    password_hash TEXT,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create consignor_setup_tokens table
CREATE TABLE IF NOT EXISTS consignor_setup_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consignor_id UUID NOT NULL REFERENCES consignors(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for consignor_setup_tokens
CREATE INDEX IF NOT EXISTS idx_setup_tokens_consignor_id ON consignor_setup_tokens(consignor_id);
CREATE INDEX IF NOT EXISTS idx_setup_tokens_token_hash ON consignor_setup_tokens(token_hash);
