-- Custom profile backgrounds: a cosmetic scene behind the member's profile hero, unlocked by level and
-- equipped by the member. Purely decorative; 'none'/NULL = no scene. See src/lib/marketplace/backgrounds.js.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS equipped_background TEXT;
