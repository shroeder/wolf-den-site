-- A HULL CAN BE MARKED AS FACING THE WRONG WAY.
--
-- Ship art is drawn bow-left by convention and nothing enforces it. The Black Liturgy came back from the
-- generator bow-right, so it sailed backwards past every other hull on the water — its stern castle sat exactly
-- where the other nine keep a bowsprit.
--
-- Re-exporting the sprite fixes one ship and teaches the game nothing. The scene ALREADY knows how to draw a
-- hull the other way round: `mirror` flips the art, the measured zone boxes and (since the guns were made to
-- mirror with it) the barrels and target markers. That machinery existed for rival captains. All that was
-- missing was a way to say "this particular drawing faces the other way" and have it stick.
--
-- So it lives next to the gun placements, keyed by the same art id and edited from the same lab: place the
-- guns, mark the facing, save the hull. One row per hull, and a hull can now have a row with NO guns on it —
-- flipping is an edit in its own right.
ALTER TABLE mkt_gun_port ADD COLUMN IF NOT EXISTS flipped BOOLEAN NOT NULL DEFAULT FALSE;

-- The one that started it. Seeded rather than left for someone to tick, because it is wrong on the live site
-- right now and the fix should land with the deploy rather than wait for a visit to the lab.
INSERT INTO mkt_gun_port (art, ports, flipped)
VALUES ('enc:black_liturgy', '[]'::jsonb, TRUE)
ON CONFLICT (art) DO UPDATE SET flipped = TRUE;
