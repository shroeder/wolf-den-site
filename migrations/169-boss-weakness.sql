-- Each weekly boss has a WEAKNESS that amplifies a specific playstyle (crit / first-strike / finisher /
-- pet / pack / burst), so players re-optimize their loadout each week. Assigned at boss creation.
ALTER TABLE boss_event ADD COLUMN IF NOT EXISTS weakness TEXT;

-- Give the current live boss a random weakness right away.
UPDATE boss_event
   SET weakness = (ARRAY['exposed','sluggish','frail','beast_cursed','hunted','unstable'])[floor(random() * 6) + 1]
 WHERE status = 'live' AND defeated_at IS NULL AND weakness IS NULL;
