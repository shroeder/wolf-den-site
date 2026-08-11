-- ONE PET YOU ARE HOPING FOR.
--
-- The Breeder's Eye (an ascension power) says you choose which pet a random pet reward gives you. Every pet
-- drop in the game picks from "eligible and not already owned" — chests, the boss, fishing, raids, sea fights
-- — so honouring a choice needs somewhere to keep the choice, and nothing on mkt_buyer meant anything like it.
--
-- Deliberately NOT a table. It is one nullable value per member with no history worth keeping: naming a second
-- pet replaces the first, and owning the one you named clears it on the next drop.
--
-- The wish is a PREFERENCE, never a guarantee. pet-drops.js only honours it when the wished pet is already in
-- the pool that roll would have drawn from — so it steers a drop you were going to get, and can never reach a
-- pet the source could not have given you.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS pet_wish TEXT;

-- AND THE PET STILL RINGING AFTER YOU PUT IT DOWN.
--
-- The Whistle: a pet you swap out keeps its ability for the rest of the day. Enshrining is the permanent
-- version of that promise and it has its own table because it is permanent; this one expires at midnight, so
-- it is two columns rather than a row somebody has to remember to delete.
--
-- Only the LAST pet swapped out is kept. Otherwise a member with a large collection could cycle every pet
-- through the slot in a minute and end the day carrying all of them at once, which is not what "a pet you swap
-- out" describes and would be far and away the strongest thing on the list.
--
-- The day is a DATE in STORE time. Never build a JS Date from it to compare — read through JS it is a day
-- behind on Vercel, which has already broken the daily check-in once.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS whistle_pet TEXT;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS whistle_day DATE;

-- AND A WHEEL RESULT NOT YET TAKEN.
--
-- Dealer's Choice: re-roll any wheel result once and keep whichever you prefer. "Whichever you prefer" only
-- means anything if NEITHER prize has been handed over yet — a granted prize cannot be given back without
-- clawing gold, gear or a chest out of an account, which is the one thing a reward system must never do.
--
-- So a spin taken with the power in hand pays nothing until the member decides. This column holds the wedge
-- (and the wheel it came off, since the wheel changes with level) until they do.
--
-- It can never strand a prize: doSpin settles any outstanding choice before it rolls again, and the spin state
-- carries the pending pair so a reload puts the same decision back on screen.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS spin_pending JSONB;

-- AND THE COLLECTION PIECE YOU DO NOT OWN.
--
-- The Loaned Exhibit: one piece you are missing counts as owned. The collections contract is that a set pays
-- for being OWNED, and every affinity aggregate unions in the owned pieces — so a loan is one id added to that
-- union, and nothing else. It is never gifted, never tradeable, and it stops the moment the piece is taken off.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS exhibit_piece TEXT;
