-- Price-threshold inventory alerts: a buyer can ask to be notified only when a listing appears at or
-- under a target price ("Surging Sparks ETB under $90"). NULL = notify at any price (existing behavior).

ALTER TABLE mkt_want ADD COLUMN IF NOT EXISTS max_price NUMERIC(10, 2);
