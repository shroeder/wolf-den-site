# Canned states for `film.mjs --mock`

Every client screen in this repo draws what `/api/...` hands it, so a state can be served at the browser
instead of written into Neon. That matters because the alternative — putting a real account into the state you
want to photograph — can only be done once, carefully, on somebody's live data, which means every OTHER state
goes unlooked-at. A blocking banner shipped two screens below the fold that way: one state was filmed, and it
was not that one.

    node scripts/film.mjs "http://localhost:3000/marketplace/sailing" out/x \
        --mock scripts/fixtures/sailing.captain.json --fold ".sail-capblock"

`sailing.base.json` was captured from a real response and scrubbed (name, gold, doubloons, ids). It is the
SHAPE, kept honest by being real; the variants next to it are derived from it by `scripts/sail-states.mjs`,
which then films each one at a phone and a desktop size and reports whether the thing you care about is
actually on the screen.

⚠️ A fixture that never matched is worse than no fixture — the rig films the real state and reports success.
`--mock` prints which keys it served and which `/api/` calls fell through for that reason.
