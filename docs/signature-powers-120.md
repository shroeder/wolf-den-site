# 120 signature powers — proposal, rebuild 2

Rebuilt 2026-08-11 after the second audit. Not assigned to items, not in code — `signatures.js` is untouched.

## The brief

- **Not combat. Not the boss.** The existing 31 signature mechanics are almost all damage procs, which is why
  marquee gear feels identical and why every system built after the boss fight has nothing to chase.
- **Chunky. No percentages.** Remove a limit, guarantee an outcome, add a slot, double an output.
- **No redundancy across the 120.**
- **Equipped items are off limits.** 48 of the 120 items that carry a signature today are worn by somebody.

## The two tests every entry now has to pass

The first draft was audited for balance only. That was half the job, and it produced things like "you may keep
a second full loadout" — a whole new inventory system wearing an item's clothes.

**TEST 1 — BUILD COST.** A power ships if it can be written as: *at a decision point that already exists, read
one value and change one number or take one branch.* That is exactly the shape of `getPetSystemPerk(buyerId,
key)`, which farm-crops.js, cooking.js, crafting.js, fishing.js, sailing.js, mining.js, chests.js and town.js
all already call. Two classes are allowed:

- **A — a number.** A cap, a cost, a count or a chance that is already read somewhere. (`+2 plots`, `no
  auction fees`, `chests open one rarity higher`)
- **B — a branch.** One `if` at a decision point that already exists. (`never fails`, `the first cast each day
  lands the rarest fish`, `this harvest also drops a chest`)

Anything needing **new persistent state, a background job, a second inventory, a new screen, or an effect that
reaches another member's account** is out. Those are features, and a feature is not an item.

**TEST 2 — A BOUNDED LOOP.** The power must have a ceiling that does not move. "Every third cook is free" is
bounded. "Cooking never consumes ingredients" is not — it is the meter, and the meter is the game.

Every entry below carries its class. If an entry cannot be given an A or a B, it does not belong on the list.

---

## The Farm

| # | Name | Effect | Class | Tier |
|---|---|---|---|---|
| 1 | **Perennial Root** | One harvest in three returns the seed you planted. | B | Celestial |
| 2 | **Hothouse Glass** | Your crops go into the ground already a third grown. | B | Eternal |
| 3 | **Second Sowing** | Two extra plots, permanently. | A | Primordial |
| 4 | **Nightsoil** | Every plant you put in the ground goes in already fertilized, free. | B | Celestial |
| 5 | **The Rain Barrel** | It is always raining on your farm, whatever the sky is doing. | B | Celestial |
| 6 | **Bumper Season** | The first harvest you take each day pays double. | B | Celestial |
| 7 | **Windfall Orchard** | The first crop you harvest each day also drops a chest. | B | Eternal |
| 8 | **The Fallow Deed** | A plot left empty overnight yields double the next time you harvest it. | B | Eternal |
| 9 | **The Cold Frame** | One crop in three ignores its grow time entirely and is ready the moment it goes in. | B | Celestial |
| 10 | **The Long Furrow** | No crop of yours ever takes longer than eight hours. | A | Primordial |
| 11 | **The Open Gate** | Petting and feeding on other people's farms never spends your daily budget. | B | Ascendant |
| 12 | **The Seed Drill** | One harvest in four drops a second seed of what you planted. | B | Eternal |
| 13 | **The Garden Path** | Every decoration on your farm gives a buff, whatever its rarity — cosmetics included. | B | Celestial |

## Fishing

| # | Name | Effect | Class | Tier |
|---|---|---|---|---|
| 14 | **The Tide Table** | Casts you don't use roll over. Bank up to a week and spend the lot at once. | B | Celestial |
| 15 | **The Fishmonger's Standing Order** | One fish in three sells at the price of the next rarity up. | B | Eternal |
| 16 | **Two Hooks** | One cast in three lands a second fish. | B | Primordial |
| 17 | **The Lantern** | Casts made while the shop is closed pay double. | A | Eternal |
| 18 | **The Dredge Net** | One cast in four brings up treasure instead of a fish. | B | Eternal |
| 19 | **Cold Bait** | Your first cast each day cannot land a common. | B | Ascendant |
| 20 | **The Full Creel** | Your daily casts refresh at noon as well as at midnight. | A | Celestial |
| 21 | **The Chummed Water** | Every fifth cast is refunded. | B | Eternal |
| 22 | **The Long Haul** | One fish in four comes up two tiers rarer than it rolled. | B | Celestial |
| 23 | **The Gaff** | A fish that beats your personal best for its species refunds the cast. | B | Ascendant |
| 24 | **The Tithe of Scales** | Every fish you land also gives a random chest fragment. | B | Eternal |
| 25 | **The Trawl** | One cast in five lands the whole tier — one of every fish at that rarity. | B | Celestial |

## Sailing

| # | Name | Effect | Class | Tier |
|---|---|---|---|---|
| 26 | **Press-Ganged Crew** | Voyages finish in half the time. | A | Primordial |
| 27 | **Twice-Landed** | Every voyage makes landfall twice — two dig sites where there was one. | A | Primordial |
| 28 | **Deep Ballast** | Four more digs' worth of stamina on every voyage. | A | Celestial |
| 29 | **Diviner's Rod** | Every dig site is buried with the most fragments it can hold. | A | Primordial |
| 30 | **The Shipwright's Debt** | One boat upgrade in three costs you nothing. | B | Eternal |
| 31 | **The Prize Court** | One encounter in three pays its doubloons twice. | B | Celestial |
| 32 | **The Quiet Passage** | One encounter in three lets you pass without a fight and keeps the spoils. | B | Ascendant |
| 33 | **The Full Manifest** | One voyage in three returns with an item from the Quartermaster's locker. | B | Celestial |
| 34 | **Beachhead** | One dig site in three is already half uncovered when you arrive. | B | Eternal |
| 35 | **The Press Gang** | One voyage a day returns the moment you send it out. | B | Celestial |
| 36 | **The Kraken's Toll** | Sea monsters you meet pay you to be left alone. | B | Eternal |
| 37 | **Salvager's Claim** | One voyage in three comes home with a piece of gear in the hold. | B | Eternal |
| 38 | **Chartwright** | It takes half as many fragments to complete a chest. | A | Primordial |

## The Depths

| # | Name | Effect | Class | Tier |
|---|---|---|---|---|
| 39 | **Shored Timbers** | The first collapse of each trip does nothing at all. | B | Eternal |
| 40 | **The Long Vein** | One seam in three pays out twice over. | B | Celestial |
| 41 | **The Assay Office** | One smelt in three costs no ore at all. | B | Celestial |
| 42 | **The Wide Seam** | One seam in three comes out a grade richer than it rolled. | B | Celestial |
| 43 | **The Deep Key** | You start every descent five floors down. | A | Primordial |
| 44 | **The Miner's Lamp** | Your trips start at the depth you reached last time, not at the top. | B | Eternal |
| 45 | **The Deep Cart** | One trip in three brings back twice the ore. | B | Celestial |
| 46 | **The Night Cage** | One extra trip a day, and the first bought trip costs nothing. | A | Primordial |
| 47 | **Assayer's Eye** | One haul in three comes back at the best grade it contained. | B | Eternal |
| 48 | **The Delver's Rope** | A dungeon run that ends badly does not count against your run for the day. | B | Eternal |
| 49 | **The Warren Map** | Every dungeon run has one extra floor before the boss. | A | Eternal |
| 50 | **The Gem Cutter's Eye** | One dungeon boss in two drops a gem. | B | Celestial |

## The Kitchen

| # | Name | Effect | Class | Tier |
|---|---|---|---|---|
| 51 | **The Banked Fire** | Every third cook consumes no ingredients. | B | Eternal |
| 52 | **The Hot Stone** | One cook in three comes out a tier better than the recipe. | B | Primordial |
| 53 | **The Prep Bench** | One prep in three yields an extra ingredient. | B | Eternal |
| 54 | **The Big Pot** | One cook in three makes more of whatever it made. | B | Celestial |
| 55 | **The Head Chef** | A cook never pays the bottom rung. The consolation is off your ladder. | B | Eternal |
| 56 | **The Tasting Menu** | One cook a day makes every dish you KNOW those ingredients could have made. | B | Celestial |
| 57 | **The Standing Recipe** | Twice a day, a recipe may be cooked with any ingredients you hold. | B | Ascendant |
| 58 | **The Copper Pot** | One cook in four makes a second helping. | B | Celestial |
| 59 | **The Cellar Key** | One harvest or landing in three puts a second copy in your pantry. | B | Eternal |
| 60 | **The Substitution** | Three times a day, one ingredient a recipe asks for may be swapped for any other you hold. | B | Ascendant |
| 61 | **Chef's Pick** | One dish a day cooks at perfect timing without playing it. | B | Ascendant |

## The Forge & the Jewelcutter

| # | Name | Effect | Class | Tier |
|---|---|---|---|---|
| 62 | **The Cold Hammer** | Every third enhance consumes no parts. | B | Primordial |
| 63 | **The Smith's Certainty** | An enhance that fails costs you nothing and may be tried again at once. | B | Primordial |
| 64 | **Twice-Struck** | One salvage in three returns double parts. | B | Celestial |
| 65 | **The Attuned Bench** | Every attunement you carry counts at double its level. | A | Primordial |
| 66 | **The Jeweller's Eye** | Every gem you have set counts as one tier higher than it is. | A | Primordial |
| 67 | **Jeweller's Patience** | One gem in three survives being pulled from its socket. | B | Eternal |
| 68 | **The Steady Bench** | A failed fuse returns all three gems. | B | Eternal |
| 69 | **The Master's Mark** | One enhance in three counts as two levels instead of one. | B | Celestial |
| 70 | **The Reforging Right** | Reforging an element costs half. | A | Ascendant |
| 71 | **The Tempered Edge** | Your gear's enhancement bonuses count double. | A | Primordial |
| 72 | **The Whetstone** | One enhance a day is a guaranteed critical success. | B | Celestial |
| 73 | **The Deep Facet** | A gem set in one piece also gives its stat to the piece beside it. | B | Primordial |

## The Town

| # | Name | Effect | Class | Tier |
|---|---|---|---|---|
| 74 | **Founder's Charter** | The travelling merchant sells to you at half price. | A | Ascendant |
| 75 | **The Standing Order** | The travelling merchant's one-a-day chest limit becomes three of each. | A | Ascendant |
| 76 | **Patron of Works** | Gold you give to a town project counts double toward it. | A | Eternal |
| 77 | **Market Day** | The travelling merchant restocks for you, on demand, once a day. | B | Ascendant |
| 78 | **The Warden's Key** | You may release one person from the Stockade each week. | B | Ascendant |
| 79 | **The Free Company** | Your spoils ceiling on a town raid is doubled. | A | Eternal |
| 80 | **The Muster** | You may fight in a town raid from anywhere. You need not be stood in the plaza. | B | Ascendant |
| 81 | **The Toll House** | Every member who visits your farm pays you a toll — from the house, not from them. | B | Ascendant |
| 82 | **Standing Invitation** | Anyone may visit your farm without spending one of their daily visits. | B | Ascendant |

## Chests, the Wheel & the Daily

| # | Name | Effect | Class | Tier |
|---|---|---|---|---|
| 83 | **The Locksmith** | One chest in three opens a rarity higher. | B | Primordial |
| 84 | **Twin Hinges** | One chest a day gives its rewards twice. | B | Celestial |
| 85 | **The Free Spin** | Your first three spins each day cost nothing. | A | Eternal |
| 86 | **Dealer's Choice** | Re-roll any wheel result once and keep whichever you prefer. | B | Ascendant |
| 87 | **The Standing Streak** | Your check-in streak never breaks, and it counts double toward every streak reward. | A | Eternal |
| 88 | **Day's Double** | Your daily check-in pays out twice. | B | Celestial |
| 89 | **The Quartermaster's Round** | Every daily quest is issued one step already done. | B | Ascendant |
| 90 | **Bounty Board Rights** | You may take a fourth daily quest. | A | Ascendant |
| 91 | **The Master Key** | One chest in three also gives you the chest one tier below it, to open yourself. | B | Eternal |
| 92 | **The Sorting Table** | A chest that would pay you dust widens to the rarity above instead. | B | Eternal |
| 93 | **The Long Day** | Every daily allowance in the game is one larger. Every single one. | A | Primordial |

## Pets

| # | Name | Effect | Class | Tier |
|---|---|---|---|---|
| 94 | **The Long Vigil** | Your equipped pet earns pet XP at triple the rate. | A | Primordial |
| 95 | **The Deep Bowl** | One treat in three feeds your pet without being used up. | B | Ascendant |
| 96 | **The Long Leash** | Your pet's ability keeps working while you are on someone else's farm. | B | Ascendant |
| 97 | **Breeder's Eye** | You choose which pet a random pet reward gives you. | B | Ascendant |
| 98 | **The Second Sitting** | One time in three, your equipped pet's ability fires twice. | B | Celestial |
| 99 | **The Beast's Share** | Your equipped pet's ability works at the strength it would have one level higher. | A | Celestial |
| 100 | **The Second Bowl** | Your equipped pet's passive counts twice toward the menagerie total. | A | Primordial |
| 101 | **The Shepherd's Crook** | An enshrined pet's passive counts twice as well. | A | Celestial |
| 102 | **The Long Table** | Your menagerie ceiling is half again as high. | A | Primordial |
| 103 | **The Whistle** | A pet you swap out keeps its ability for the rest of the day. | B | Ascendant |

## Market, Trade & Credit

| # | Name | Effect | Class | Tier |
|---|---|---|---|---|
| 104 | **The Auctioneer's Seat** | You pay no listing fee, and listing never takes the item out of your bags. | A | Ascendant |
| 105 | **Merchant's Word** | A trade you offer holds its items in escrow without taking them off you. | B | Ascendant |
| 106 | **The Standing Offer** | One item a day, the shop buys from you at the price it sells for. | B | Ascendant |
| 107 | **The Purser's Exchange** | Doubloons and laurels convert freely into one another. Gold stays out of it. | B | Ascendant |
| 108 | **The Counting House** | The gold in your purse earns interest, paid at every check-in. | B | Ascendant |
| 109 | **The Merchant's Eye** | One daily deal each day is offered to you at half price. | A | Ascendant |
| 110 | **No Reserve** | An auction that does not sell is relisted for you, free, until it does. | B | Ascendant |
| 111 | **The Bulk Buyer** | One purchase in three from the gold shop comes in pairs. | B | Ascendant |
| 112 | **The Merchant's Ledger** | The travelling merchant stocks his whole catalogue for you, whatever your Trading Post level. | A | Ascendant |

## Collections & Standing

| # | Name | Effect | Class | Tier |
|---|---|---|---|---|
| 113 | **The Completionist's Ledger** | One piece of a set counts as two toward its tier bonuses. | A | Primordial |
| 114 | **Herald's Licence** | One badge a month is granted to you outright, chosen from what you are missing. | B | Ascendant |
| 115 | **The Loaned Exhibit** | One collection piece you do not own counts as owned. You choose which. | B | Ascendant |
| 116 | **The Seal of Office** | A collection you have completed keeps paying if you lend a piece away. | B | Primordial |
| 117 | **The Long Service Record** | Your ten best badges pay their bonus twice. | A | Primordial |
| 118 | **The Chronicle** | Anything you are first in the Den to do is written into the Live Feed under your name. | B | Ascendant |
| 119 | **The Founder's Plate** | One collection piece a week is delivered to you, chosen from what you are missing. | B | Primordial |
| 120 | **The Standing Ovation** | A cheer pays you twice over — both times you cheer and when the hero lands their strike. | B | Ascendant |

---

## Cut log — what came off, and why

**40 cut for an unbounded or compounding loop.** Endless Line, Nightshift, Chum Barrel, Old Hand, Sealed
Orders, Bottomless Hold, Salt Ledger, Cold Furnace, Whole Salvage, The Transmuter's Hand, the old Patron of
Works, The Unspent Spin, Hoarder's Blessing, The Shrine Keeper, The Menagerie Deed, The Founder's Seal, the
old Shored Timbers, Miner's Pension, The Bell of the Fourth Level, The Standing Pot, Grandmother's Book, The
Recipe Hunter's Nose, Cold Anvil, The Perfect Cut, Wolf's Eye Sight, The Whole Kennel, Feast for the Pack,
Twin Souls, Coin of the Realm (rewritten), Seedvault, Open Gate, Gleaner's Right, The Last Word, and others
noted in the register from rebuild 1.

**3 cut as DEAD — they removed a limit that does not exist.**

| Was | Why it did nothing |
|---|---|
| Ice Auger | Fishing has no location gate. |
| Cold Store | The pantry is a plain quantity table. The limit was always supply, never storage. |
| Deep Pockets | There is no bag cap, vault cap or inventory limit anywhere in the codebase. |

**11 cut on BUILD COST — features, not items.**

| Was | What it would actually have taken |
|---|---|
| Vaultwright | A second full inventory and a swap system. |
| The Set Line | A background job fishing on a timer while the player is offline. |
| Bedrock Claim | Per-member persistent seam state carried across trips. |
| The Standing Crew | Concurrent voyage state — sailing assumes one boat, one trip. |
| The Second Table | Concurrent cook state, same problem. |
| Baker's Dozen | An item-gifting flow that does not exist. |
| Scrapwright | An overnight background job over everyone's bags. |
| The Standing Order | The same, for the Forge. |
| The Second Collar | A second pet slot — reaches every screen that draws a pet. |
| The Beastspeaker's Pact | Already how it works. Pets trickle XP daily. |
| The Standing Bid | A live bidding agent. |

**9 cut for taking something from another member.** Sharp Eyes, Right of First Refusal, The Sealed Bid,
Guildhall Standing, Right of Sanctuary, The Open Door, The Crier's Bell, Chronicle Rights (as written), Feast
Day. Two survive in reworked form: **The Toll House** and **Standing Invitation** pay from the house rather
than from the other member, and **The Chronicle** records a fact rather than letting anyone author text.

**1 cut for touching real money.** The Standing Account — store credit is bought with dollars, and refunding
it as coins at full value while the credit is still spent is a giveaway with a real cost attached.

## Third pass — 2026-08-11

**Attuning Fire (65)** and **The Seal of Office (116)** stand as written. Both are deliberate exceptions to a
rule the game otherwise enforces — a 10x on an attunement chance that was cut to 0.4x three days earlier, and
a capstone that fires before its set is complete. Chosen, not overlooked.

**The Long Weekend was incoherent and is gone.** It read "every daily allowance refreshes on Saturday as well
as at midnight", which is not a power at all — every allowance already refreshes daily, Saturday included. It
is now **The Long Day (93)**: every daily allowance in the game is one larger. Same intent, and it means
something.

**Perennial Root (1) was too strong** and is now scoped to a single crop of your choosing rather than every
harvest you ever take.

**The Second Socket (66)**, formerly The Fourth Socket. `MAX_SOCKETS = 1` in gems.js, with a note above it
saying the number is written as a number precisely so the bench is the only thing that has to change for two —
and `mkt_item_socket` is keyed on `(buyer_id, item_id, idx)`, so several sockets were always in the data model.
Class A confirmed against the source. Scaled to two rather than four: 1 → 2 doubles the gems on every piece,
which is enough.

**All 15 information powers are gone.** Every one was a "you can see / you now know", which is a wiki page on
an item rather than a chase reward. They crept in because they are trivially class B and the build-cost test
was the newest thing on my mind. Replaced with:

| # | Was | Now |
|---|---|---|
| 12 | The Almanac | **Crop Rotation** — a different crop in that plot grows in half the time |
| 22 | Cartographer's Float | **The Salt Cure** — pantry fish never spoil and count double as ingredients |
| 27 | The Sounding Line | **Twice-Landed** — every voyage makes landfall twice |
| 32 | Reading the Weather | **Letters of Marque** — refight any encounter you lose, once each, free |
| 42 | Lodestone Heart | **The Wide Seam** — every seam comes out one grade richer |
| 45 | The Dowsing Chain | **The Deep Cart** — twice as much ore out of every trip |
| 49 | Cavernlight | **The Iron Door** — a cleared dungeon floor stays cleared |
| 55 | The Tasting Spoon | **The Second Seasoning** — every dish carries two buffs |
| 60 | The Menu Board | **Family Recipe** — a recipe cooked ten times drops its rarest ingredient forever |
| 71 | The Grading Loupe | **The Deep Temper** — your enhancement ceiling is five levels higher |
| 79 | The Bell Tower | **The Charter of Passage** — town raids cost none of your daily allowance |
| 91 | The Glass Chest | **The Master Key** — every chest also drops the tier below it, already open |
| 99 | The Kennel Book | **The Prize Litter** — every pet counts one rarity higher for its passive |
| 106 | The Honest Broker | **The Consignment Note** — shop sales pay the last auction price |
| 115 | The Archivist | **The Standing Exhibit** — a piece counts toward every set it could belong to |

## Fourth pass — the laundering test

Luke, on The Second Socket: *"if you pull that powered item off, does it remove the sockets from all your gear?
And can people just farm the second socket and then trade the gear away?"* Yes to both, and it generalises into
a third test.

**TEST 3 — NO MINTED STATE.** A power may not permanently alter an item's own properties while being conditional
on wearing something else. Two failures, always together: pull the source off and you orphan whatever it
created, and in between you can equip it, upgrade a stack of gear, unequip, and sell gear carrying value nobody
paid for. `mkt_item_enhance` holds the enhancement level AND the attunement per item, and the attunement follows
the item to whoever buys it — so this is a real trade, not a theoretical one.

Generating LOOT while equipped is fine and is not this. The flaw is specifically **upgrading an item that
already exists.** Five entries failed:

| # | Was | Now | The laundering |
|---|---|---|---|---|
| 65 | Attuning Fire | **The Attuned Bench** | Enhance a stack, every one attunes, unequip, sell attuned gear |
| 66 | The Second Socket | **The Jeweller's Eye** | Cut sockets into ten pieces, unequip, sell them socketed |
| 71 | The Deep Temper | **The Tempered Edge** | Enhance past the ceiling, unequip, sell overlevelled gear |
| 73 | The Socket Punch | **The Deep Facet** | Same as 66, at rarities that cannot normally hold a socket |
| 102 | Ancestral Line | **The Long Table** | Level every pet once, unequip, trade the levelled pets |

All five replacements are **conditional** — they change what your gear is worth while you wear it and leave
nothing behind when you take it off. The Jeweller's Eye makes a Polished act as a Flawless; The Deep Facet
spreads one gem's stat across all nine slots; The Long Table lifts the menagerie ceiling (a real cap:
`SYSTEM_PASSIVE_CAP` is 30 on the farm stats, 25 on the sea stats, 4 on stamina).

**Open question, not a flaw.** **Second Sowing (3)** and **Terrace Farming (13)** grant account capacity rather
than item state, so nothing can be laundered — but they still need an answer for what happens when the item
comes off. The intended behaviour is that the extra plots and decoration slots go dormant rather than being
destroyed: crops keep growing, decorations stay placed, and neither can be interacted with until the item is
worn again. Worth confirming before either is built.

## Fifth pass — stop inventing mechanics

Ten of the fifteen replacements written in the third pass were aimed at systems that do not work the way I
assumed. Luke caught all of them. What the code actually says:

- **Dishes have no buffs and are not consumed.** A cook rolls a reward off a TIER ladder — seeds, gold, parts,
  consumables, recipes, chests — where index 0 is the consolation and the last entry is the prize.
- **Nothing spoils.** There is no food decay, and no pantry cap.
- **Dungeon floors are not persistent.** A run generates its own floors, one run per dungeon per day. There is
  no "cleared" state for a power to act on.
- **Town raids have no daily allowance.** There is no limit to hand back.
- **People like opening chests.** A power that opens one for you takes away the part they came for.

| # | Was | Why it was wrong | Now |
|---|---|---|---|---|
| 22 | The Salt Cure | Nothing spoils | **The Long Haul** — fish come up two tiers rarer than they rolled |
| 49 | The Iron Door | No persistent floors, and it read as a debuff | **The Cartographer's Coin** — take both options at a choice floor |
| 55 | The Second Seasoning | Dishes have no buffs | **The Top of the Ladder** — every cook pays the top rung, never the consolation |
| 60 | Family Recipe | Permanent effect on gear you can take off | **The Substitution** — swap any one ingredient for any other you hold |
| 79 | The Charter of Passage | Town raids have no allowance | **The Free Company** — your raid spoils ceiling is doubled |
| 91 | The Master Key | Opening it for you removes the fun | **The Master Key** — you get the tier below to open yourself |
| 98 | First Light | Minted permanent pet levels (Test 3) | **The Second Sitting** — your pet's ability fires twice |
| 99 | The Prize Litter | Too strong across every pet you own | **The Beast's Share** — the equipped pet's ability acts one level higher |
| 106 | The Consignment Note | A money printer | **The Standing Offer** — one item a day, the shop buys at its selling price |
| 115 | The Standing Exhibit | Did not mean anything | **The Loaned Exhibit** — one piece you do not own counts as owned |

**TEST 4 — VERIFY THE MECHANIC FIRST.** Three passes running, the same failure: a power aimed at something the
game does not do. Dead on arrival in pass two (no bag cap, no pantry cap, no location gate), incoherent in pass
three (an allowance that already refreshes daily), invented in pass four (buffs, spoilage, persistent floors,
raid allowances). Nothing goes on this list again without reading the system it touches.

## Sixth pass — chunky, but not certain

Luke, reading the full list: *"wherever we say every, we need to go through all these and make them not as
powerful, not as deterministic. I like that they're all chunky, but a lot of these need to be a little more
chance based and a little less deterministic."*

That inverts the original "no percentages" note, and correctly. "No percentages" was aimed at **+8% yield** —
a number so small it is invisible. It was never an argument for **certainty**, and certainty is what makes a
power feel like a cheat rather than a thrill: if every cast lands two fish, the second fish stops being an
event by the third cast.

**TEST 5 — A BIG EFFECT ON A ROLL, NOT A SMALL ONE ALWAYS.** Odds are written the way perkDesc already writes
them — *"about 1 harvest in 17 comes up DOUBLE"* — so a chance reads as **one in three**, never as a
percentage. Forty entries were rewritten. Nineteen are now chance-gated.

An "every" that survived is one of three things and none of them is a per-event faucet: a **ration** (every
third cook, every fifth cast), a **capacity** (four more digs' stamina, two extra plots), or a **conditional
stat** (attunements count double while worn).

### Named individually by Luke

| # | Was | Why | Now |
|---|---|---|---|---|
| 1 | Perennial Root | Must stop when the item comes off; "of your choosing" needed farm UI | **One harvest in three returns its seed** |
| 4 | Nightsoil | Luke's own rewrite | **Every plant goes in already fertilized, free** |
| 5 | The Pig's Standing Invitation | The Loot Pig already comes daily | **Sun Trap** — sunny weather halves grow time |
| 12 | Crop Rotation | Did not read clearly | **The Seed Drill** — one harvest in four drops a second seed |
| 13 | Terrace Farming | The decoration cap is there for performance | **The Garden Path** — decorations count twice toward rating |
| 17 | Moonwater | "Night bonuses at every hour" did not parse | **The Lantern** — casts while the shop is closed pay double |
| 19 | Unbreakable Leader | Weak | **Cold Bait** — your first cast each day cannot land a common |
| 24 | The Tithe of Scales | Luke's own rewrite | **Every fish gives a random chest fragment** |
| 30 | The Shipwright's Debt | Free is too much | **Boat upgrades cost half** |
| 35 | Following Star | Lame | **The Press Gang** — one voyage a day returns instantly |
| 38 | Chartwright | Already how fragments work | **Half as many fragments per chest** (10 → 5) |
| 43 | The Deep Key | Ten was too deep | **Five floors down** |
| 44 | Second Pick | Redo | **The Miner's Lamp** — deep seams appear five floors shallower |
| 48 | The Dungeon Ledger | Would mean re-running part of a dungeon | **The Delver's Rope** — a bad run doesn't spend your daily |
| 49 | The Cartographer's Coin | Redo | **The Warren Map** — one extra floor before the boss |
| 52 | Iron Palate | Cannot hand out the top tier | **The Hot Stone** — one cook in three comes out a tier better |
| 53 | Mise en Place | Prep cannot be skipped | **The Prep Bench** — one prep in three yields an extra |
| 54 | The Long Larder | Nothing expires | **The Big Pot** — one cook in three makes more |
| 55 | The Top of the Ladder | Cannot hand out the prize | **The Head Chef** — the consolation rung is off your ladder |
| 56 | The Tasting Menu | Scope to recipes you know | **every dish you KNOW those ingredients could have made** |
| 57 | The Standing Recipe | Needed a limit | **Twice a day** |
| 58 | The Copper Pot | Needed a chance | **One cook in four makes a second helping** |

## Seventh pass — a self-audit against every rule so far

Twenty-five more reworked, this time without being asked entry by entry. Three were aimed at limits that do
not exist, which is the fourth pass running that has produced at least one:

| # | Was | What the code actually says |
|---|---|---|
| 2 | Hothouse Glass — "one growth stage along" | Growth **stages are purely visual** — FarmClient swaps a sprite at 33% and 72% progress. The server has `planted_at` and `ready_at` and nothing else. Now: **a third grown**, which is a real shift of `ready_at`. |
| 5 | Sun Trap — "while it is sunny" | There is **no sun**. Only rain, reported by the client, `RAIN_CUT = 0.3`, once per plot per 6h. Now **The Rain Barrel** — rain takes half instead of a third, with no cooldown. |
| 103 | The Whistle — "swapping costs nothing" | Swapping is **already free and has no cooldown** (`equipPet` just writes the column). Now: your pet keeps earning for an hour after you swap it out, which is a real change to the trickle clock. |

The other twenty-two were failures of the rules already agreed:

- **Still deterministic where it should roll** — The Fishmonger's Standing Order, Stormglass, The Deep Cart,
  Assayer's Eye, The Bulk Buyer, Jeweller's Patience.
- **Needed UI that does not exist** — The Fallow Deed wanted you to nominate a plot; Bumper Season had to know
  which harvest was "largest", which cannot be known until the day is over.
- **Removed a deliberate rule outright** — Jeweller's Patience undid `UNSOCKET_DESTROYS`, which the code calls
  "the point of the choice"; The Long Table deleted `SYSTEM_PASSIVE_CAP` rather than raising it; Founder's
  Charter sold at cost where `town_haggle` caps at 30%.
- **Redundant with a neighbour** — Deep Water Licence against The Long Haul, The Full Creel against Cold Bait,
  The Merchant's Ledger against The Merchant's Eye, Harvest Home against Perennial Root.
- **Not a power at all** — Master's Mark was a restriction; Beachhead deleted the dig minigame the way an
  already-opened chest deletes the opening; The Founder's Plate was a profile ornament.
- **Gold from nothing** — No Reserve had the house guarantee a floor price.

Four absolutes remain and all four are deliberate: **The Rain Barrel** ("never on cooldown" — the cooldown is
the thing being bought), **The Head Chef** ("never the bottom rung" — a floor, not a jackpot), **The Standing
Streak**, and **Merchant's Word**. None is a per-event faucet.

## Eighth pass — decorations do not feed the rating

**The Garden Path (13)** said decorations count twice toward your farm's rating. They do not count at all.

A farm rating is a LIKE from another member — a positive-only three-tier vote (`like` 1 / `love` 2 / `admire`
3) stored per rater in `mkt_farm_rating`, once a day each. Nothing about your own farm feeds it. What
decorations actually do is grant passive farm buffs from `DECO_STATS` — growSpeed, seedLuck, harvestLuck,
petXp, fertPower, goldHarvest — and only from EPIC upward. Rare pieces are "mostly cosmetic", and commons
carry nothing at all: `buff` is simply null on them.

So the power now uses the mechanic that exists: **every decoration on your farm gives a buff, whatever its
rarity.** That turns roughly seventy cosmetic pieces into working ones without touching the placement cap,
which is a performance limit and not a design one.

## Ninth pass — rain

**The Rain Barrel (5)** is now simply: it is always raining on your farm. Rain already cuts 30% off every
growing crop's remaining time (`RAIN_CUT`, once per plot per 6h), so the power is that the weather stops
mattering — no waiting for a wet day, no cooldown between them.

**Stormglass (18)** is gone. Rain reaches FISHING only through the `storm_sense` pet perk — `stormOn = storm >
0 && await denIsRaining()`, so the rain check does nothing unless you are already carrying the Scarecrow Crow.
A gear power that only works when paired with one specific pet is not a power, it is a footnote. Replaced with
**The Dredge Net** — one cast in four brings up treasure instead of a fish, which uses `TREASURE_CHANCE`, the
lever `dredge` already widens and that nothing else on this list touches.

## Tenth pass — a dig turns up fragments, not chests

**Diviner's Rod (29)** said the first dig of every voyage uncovers a chest. Digs do not uncover chests. They
uncover FRAGMENTS — `FRAGMENTS_BURIED = 3` scattered through a 16-tile board, Fortune adding one per level, to
a ceiling of `MAX_BURIED = 12` — and ten fragments make a chest. Everybody already turns up a chest eventually
by digging; that is the loop, not a prize to hand out.

So the power now moves the number that actually decides a dig's worth: **every dig site is buried with the most
fragments it can hold.** Base three becomes twelve, on a board that only has sixteen tiles.

That leaves the four sailing dig powers each on a different lever, which is the point: **Deep Ballast** buys
stamina, **Beachhead** buys a head start on the board, **Chartwright** halves what a chest costs
(`FRAGMENTS_PER_CHEST` 10 → 5), and **Diviner's Rod** fills the ground.

## Eleventh pass — read the system, then write the power

Luke: *"can you just audit all of these and use common sense given you should understand how each of these
systems practically works."* Fair. Seven more, found by reading the modules rather than by remembering them.

| # | Was | What the code says |
|---|---|---|
| 11 | Kind Neighbour — "every farm you rate rates you back" | A rating is another member's VOTE. This would have written a vote in somebody else's name. Now **The Open Gate** — visiting never spends a daily visit. |
| 23 | The Gaff — "beats your record" | Records are kept by WEIGHT and there is a Den-wide record board as well as a personal best. Scoped to the personal best, which is the one you beat often enough for a power to matter. |
| 32 | Letters of Marque — "an encounter you lose costs you no sortie" | **Encounters never cost a sortie.** Sorties belong to raids, and the Cunning track already buys "a chance a raid does not use up your daily raid". Dead twice over. Now **The Quiet Passage**. |
| 37 | Salvager's Claim — "every wreck you pass" | **There are no wrecks.** The word appears once in the whole codebase, in a battle-aim comment. Repointed at the voyage itself. |
| 95 | The Full Trough — "one feed does the whole day" | **Feeding is already unlimited** from your own bag; treats are the limit, not the feeding. Now **The Deep Bowl** — one treat in three is not used up. |
| 104 | The Auctioneer's Seat — "no fees, either side" | There is only ONE side. `LIST_FEE_PCT = 0.05`, paid up front by the lister; the buyer pays nothing. |
| 120 | The Standing Ovation | Cheering already pays the cheerer XP and gold. Rewritten so it pays twice rather than describing what it already does. |

Two nearby entries were checked and stand: **The Bonded Warehouse (108)** is real because listing genuinely
removes the item from your bags, and **The Free Spin (85)** is real because the wheel gives exactly one free
spin a day and everything else is a token.

## Twelfth pass — the whole list, module by module

Four more dead, and the misses have a single shape: I kept writing powers that REMOVE A FRICTION, and half the
time the friction was not there.

| # | Was | What the code says |
|---|---|---|
| 11 | The Open Gate — "never spends a daily visit" | **There is no visit limit.** What is metered is `pettingBudget()` — how much petting and feeding you may do in a day. Repointed at the budget that exists. |
| 75 | The Plaza Key — "locked buildings are open to you" | **Nothing is locked.** "All nine are on by default… the Vault and Festival Stage used to be community-funded unlocks; they're now standing fixtures." Now **The Standing Order** — the merchant's one-chest-a-day limit becomes three. |
| 92 | The Sorting Table — "a reward you already own" | Chests **never give a duplicate.** They widen to any un-owned item of that rarity and pay gold dust only if you own the lot. Repointed at the dust. |
| 112 | The Merchant's Ledger — "stock twice as large" | Stock is `MERCHANT_STOCK` filtered by `minTier` against your Trading Post level. "Twice as large" is not a thing; ignoring the tier gate is. |

### Verified and standing

Checked against the module that owns them, and correct as written: boat upgrades (`upgradeCost = 100(n+1)²`),
smelting ore cost (`smeltCostFor`), bought mine trips (`TRIP_RECHARGE_BASE = 500`, doubling, 3/day), the
check-in streak ladder (`STREAK_REWARDS`), town projects (`TOWN_PROJECTS`, community-funded and still live),
Stockade release (`releaseFromStockade`), selling to the shop (`sellItem` / `sellValueOf`), the auction listing
fee (`LIST_FEE_PCT = 0.05`), trade expiry (`expires_at`, lazily reaped), the daily deal rotation (4 a day at
midnight, capped at epic), the wheel's one free spin a day, and cooking's timing minigame.

### The rule these misses point at

A power survives contact when it **moves a number that already governs an outcome** — `FRAGMENTS_BURIED`,
`RAIN_CUT`, `TREASURE_CHANCE`, `LIST_FEE_PCT`, `MAX_SOCKETS`, `SYSTEM_PASSIVE_CAP`, `TRIP_RECHARGE_BASE`. It
dies when it removes a friction I assumed was there. Every remaining entry has been checked against a named
constant or a named function, not against a memory of how the feature probably works.

## Thirteenth pass — will they work, are they cool, are they safe

Three questions, three different kinds of answer.

### Will they work

Yes, with the caveat earned over twelve passes: every entry is now anchored to a named constant or a named
function rather than to a memory of how a feature probably behaves. Twenty-six were killed across those passes
for aiming at something that does not exist — no bag cap, no pantry cap, no location gate, no spoilage, no dish
buffs, no persistent dungeon floors, no town-raid allowance, no wrecks, no visit limit, no locked buildings, no
duplicate chest rewards, no sortie on an encounter, no growth stages, no sun, and pet swapping and pet feeding
both already free.

### Are they safe — MEASURED, not guessed

Three were quietly enormous. Numbers first:

| # | Power | The measurement | Fix |
|---|---|---|---|---|
| 117 | The Long Service Record — every badge pays twice | **131 badges carry a bonus. All of them together are +356 Might / +74 crit chance / +64 crit power.** Best-in-slot gear across all nine slots is +202 Might — the badge pool is already bigger than the best gear in the game, and this doubled it. | **Your ten best badges** pay twice |
| 73 | The Deep Facet — one gem's stat on every piece | Gem tiers run 2 / 4 / 7 / 11 / **16**. Nine slots × a Flawless = **+144**, against +202 for an entire best-in-slot set — one gem worth three-quarters of a full kit. | The piece **beside** it, not all nine |
| 113 + 116 | One piece counts as two, and capstones fire one short | Sets are 4–6 pieces. "One counts as two" fires a four-piece capstone at **two pieces** — and 116 was a weaker version of the same idea, so they were competing. | 113 stands; **116 repointed** at lending a piece away |

For contrast, **The Jeweller's Eye (66)** measured fine and was left alone: one tier up on a Polished gem is
+4, which is a good item and not a second character.

### Are they cool — the honest answer was no, for fourteen of them

A discount is not a chase item. Seven entries were "this thing costs half", which is the least interesting
shape a power can take and dies completely once you have bought the thing it discounts — The Shipwright's Debt
was worthless the moment your boat was maxed. Another handful were invisible: a streak that never breaks, an
hour of pet trickle, a trade that does not expire. Nobody chases a primordial for those.

Rewritten to do something you can feel: boat upgrades now **refund** as doubloons, smelting has **one free in
three**, the auction seat pays the fee **back double** on a sale, the streak **counts double**, every pet earns
the trickle **from the box**, and Herald's Licence **grants you a badge a month**.

### What I would still watch

**The Long Day (93)** is one number against every daily allowance in the game and I have not measured what that
totals. **Diviner's Rod (29)** takes buried fragments from three to twelve on a sixteen-tile board, which is a
4x on the main sailing output. Both are defensible on an apex item; neither has been measured the way the badge
pool just was.

## Fourteenth pass — the two measurements, and five of my own mistakes

### The two I said I would measure

**The Long Day (93)** — one extra on every daily allowance. The allowances are: fishing casts 5, mine trips 3,
sailing raids 5, cheers 3, daily quests 3, free wheel spin 1, arena bouts 10. So +1 is between +10% and +33%
everywhere, and +100% on the wheel's free spin — broad, but it multiplies how OFTEN you play rather than what
each action pays, and none of it compounds. **Safe. Stands as written.**

**Diviner's Rod (29)** — buried fragments from 3 to `MAX_BURIED = 12`, on a 16-tile board with
`BASE_STAMINA = 12` digs a voyage and 10 fragments to a chest. That is roughly one chest a voyage against one
every three. A 4x, but on small absolute numbers and against a ceiling the game itself already defines.
**Safe on an apex item. Stands.**

### Five I broke myself in the thirteenth pass

Fixing "boring" made me break rules that were already agreed. Worth recording, because it is the same failure
mode as optimising for whichever test is newest:

| # | What I wrote | What was wrong with it |
|---|---|---|
| 30 | Boat upgrades refund as doubloons | Gold in, doubloons out — a currency bridge, which is the exact thing Coin of the Realm was cut for. Now: **one upgrade in three is free.** |
| 103 | Every pet earns the trickle from the box | This is The Whole Kennel, cut in pass two for undoing the premise of level six — only the pet you carry earns. Now: **a pet you swap out keeps its ability for the day.** |
| 104 | A sale refunds the listing fee twice over | A 5% fee paid back double is loose change dressed as a power. Merged with the genuinely useful half of 108. |
| 105 | A second offer is binding for a day | This **forces another member to accept a trade.** Straightforwardly taking from someone else. Now: escrow that does not empty your bags. |
| 114 | Shows progress on badges you have not earned | "Shows" is a tooltip, and the tooltips were culled in pass three. Kept only the half that grants one. |

**108 The Counting House** is new, filling the slot freed by the merge: gold in your purse earns interest at
every check-in.

**The list is closed.** 120 entries, no duplicates, all bounded, all class A or B, none a tooltip, none minting
state that outlives the item, none reaching into another member's account, every one aimed at a mechanic that
exists, 29 landing on a roll, the three that measured as game-breaking cut down to size, and the two largest
survivors measured and cleared.


---

# Real-world perks on the new tiers

Luke, 2026-08-11: *"real world perks are cool but they should only be in the two topmost tiers, which we are
about to create. Additionally they should just be X store credit instead of the ones we have, which are pretty
abstract and hard to apply."*

## What is there today — CORRECTED

An earlier version of this section said nobody owned a charged item and that no ascendant or eternal item
carried one. **Both were wrong.** I parsed items.js with a brace-walk that returned `rarity: null` on all 46
rows, and reported the conclusion instead of noticing that a table where every rarity is null has not been read.
Luke caught it: his wife holds one and so does Eric.

A real-world perk is a separate field set from a signature power. It lives on the item:
`charged: true, charges: N, cooldownDays: D, chargeReward: "<key>"`. Redeemed at the counter through the admin
app; `chargeState()` gates it on `charges_left` and the cooldown.

**46 of 306 items carry one, and they span every rarity:**

| Rarity | Charged items |
|---|---|
| common | 7 |
| rare | 11 |
| epic | 12 |
| legendary | 7 |
| mythic | 4 |
| **ascendant** | **3** |
| **eternal** | **2** |

The five at the top already exist:

| Item | Rarity | Pays | Owner |
|---|---|---|---|---|
| `ascendant_crown` | ascendant | **$100 store credit** | **aannw** |
| `ascendant_blade` | ascendant | a $30 bundle | **ericd** |
| `ascendant_aegis` | ascendant | a $25 pack | — |
| `eternal_wolf_crown` | eternal | a $120 box | — |
| `eternal_infinity` | eternal | the elite grail | — |

**Five members hold a charged item:** ericd and aannw as above, plus vital (`linecutter_token`, skip the line),
alstier1 (`premium_sleeve_charm`) and Nynebreaker (`starter_pack_charm`). No redemptions recorded yet.

So the idea is not new — the top two rarities ALREADY carry real-world perks, and `ascendant_crown` is already
pure store credit, which is the shape Luke wants everything to take.

## The reward vocabulary shrinks to one thing

The 42 keys in `REWARDS` include a free grading, a box-break slot, a tournament seat, "first restock pick",
"skip the line", "wall of champions", and ten different discount shapes. Every one of them needs a judgement
call at the counter. **Store credit does not.** The ladder is just an amount:

    store_credit_10 · store_credit_15 · store_credit_25 · store_credit_50 · store_credit_100

Five of those already exist as keys. The abstract ones stay defined (nothing references them once the 46 are
cleared, and deleting a key that a past redemption row points at would orphan the log) but nothing new uses
them.

## The exposure, which is the number that matters

`charges_left` DECREMENTS AND DOES NOT REFILL — the cooldown only spaces multiple charges apart. So an item
with one charge is a one-time cost, for ever, not a recurring one. That makes the whole liability countable up
front.

Proposed, at one charge each:

| Tier | Items | Carry credit | Amounts | Exposure |
|---|---|---|---|---|
| Celestial | 30 | 12 | 8 × $10, 4 × $15 | **$140** |
| Primordial | 25 | 10 | 6 × $25, 3 × $50, 1 × $100 | **$400** |
| | | **22 of 55** | | **$540 total, once, ever** |

That is the worst case where every one of the 22 is earned by somebody and every charge is redeemed — spread
over however long it takes the Den to chase down 22 apex items. Scale it by moving the count or the amounts;
the shape is what matters.

Deliberately NOT every top-tier item. Two-thirds of the apex gear pays in game terms only, so a real-world
payout stays a genuine surprise rather than the expected outcome of a tier.

## What this changes about the plan

Luke's rule — real-world perks only in the top two tiers, and only as store credit — is closer to what already
exists than it looked. Three things follow:

1. **The five top-tier charged items stay.** Two of them are held by real members. Nothing gets taken away.
2. **Their rewards want converting, not removing.** `ascendant_crown` is already `$100 store credit`. The other
   four pay a $30 bundle, a $25 pack, a $120 box and "the elite grail" — exactly the abstract kind Luke wants
   gone. Converting them to the credit ladder is roughly value-neutral and strictly easier to hand over. But
   **ericd's item changes what it pays**, so that is Luke's call, not mine.
3. **The 41 below ascendant are the real question.** Three are owned — vital, alstier1 and Nynebreaker each
   hold one. Stripping `charged` from those three takes something from somebody, however small. The other 38
   are unissued and can lose it for free.

## Two things to settle when these are minted

- **The 46 existing charged items.** They keep their stats either way. The question is whether `charged` comes
  off them entirely (they become ordinary admin-granted gear) or stays as a hand-granting tool that is simply
  never rolled. Nobody holds one, so either is free today.
- **`SELL_VALUES` has no celestial or primordial entry** (it stops at eternal: 6000). Minting either tier
  without adding them means those items sell back for `undefined`. Charged items are already blocked from being
  sold at all, which covers the 22, but not the other 33.


---

# Tiering — which power goes on which rarity

Luke, 2026-08-11: *"I trust that you can figure out which ones are better than others to elevate to the higher
rarity items, and the lower rarity items that carry these powers would get the less powerful affixes."*

**35 ascendant · 30 eternal · 30 celestial · 25 primordial.** Every one of the 120 placed exactly once,
verified by script rather than by counting down a list.

The line between the bands is what a power MOVES, not how it reads:

| Tier | The test | Examples |
|---|---|---|
| **Primordial** (25) | Changes what a whole system pays, or lifts a structural ceiling | Diviner's Rod (buried fragments 3 → 12), The Long Day (+1 on every daily allowance in the game), The Completionist's Ledger (one set piece counts as two), Second Sowing (two extra plots), Press-Ganged Crew (voyages in half the time) |
| **Celestial** (30) | Changes an outcome often enough to reshape how you play a feature | The Long Vein (one seam in three pays twice), The Hot Stone (one cook in three a tier better), Twin Hinges, The Tide Table, The Beast's Share |
| **Eternal** (30) | A strong, reliable edge inside one loop | Windfall Orchard, The Lantern, Shored Timbers, The Banked Fire, The Master Key |
| **Ascendant** (35) | A convenience, a cost shaved, or a once-a-day nicety | The Reforging Right, Market Day, Chef's Pick, The Substitution, Dealer's Choice |

Two deliberate calls worth naming, because they look like exceptions:

- **The Forge and Jewelcutter powers sit high.** The Jeweller's Eye, The Tempered Edge, The Attuned Bench, The
  Deep Facet and both enhance powers are all primordial or celestial. They multiply gear you have already
  built, which compounds with everything else you are wearing in a way a farm perk does not.
- **The market powers sit low.** No auction fee, the daily deal at half price, the gold shop in pairs — every
  one is real, and none of them changes an outcome, only a price. That is the definition of the bottom band,
  and it is why seven of them are ascendant.

# Store credit — the amounts

Luke's bands: $5–10, $20–40, $40–60, $60–120, with $120 the ceiling. One charge on everything new, so the
liability is countable rather than recurring.

| Tier | Carrying credit | Amounts | Exposure |
|---|---|---|---|
| Celestial | 8 of 30 | 4 × $20, 3 × $30, 1 × $40 | $210 |
| Primordial | 6 of 25 | 3 × $60, 2 × $80, 1 × $120 | $460 |
| | **14 of 55** | | **$670** |

**Already outstanding: $315**, and that number matters because it is live right now — the five converted items
carry 2–3 charges each, not one. aannw's ascendant_crown alone is $100 × 2. Nothing has been redeemed yet.

**All-in: $985**, once each, across 19 items. The lever is the COUNT rather than the amounts — 5 celestial and
4 primordial would be $430 new instead of $670.
