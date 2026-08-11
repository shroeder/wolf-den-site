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

| # | Name | Effect | Class |
|---|---|---|---|
| 1 | **Perennial Root** | One harvest in three returns the seed you planted. | B |
| 2 | **Hothouse Glass** | Your crops go into the ground already a third grown. | B |
| 3 | **Second Sowing** | Two extra plots, permanently. | A |
| 4 | **Nightsoil** | Every plant you put in the ground goes in already fertilized, free. | B |
| 5 | **The Rain Barrel** | Rain takes half your crops' remaining time instead of a third, and never goes on cooldown. | A |
| 6 | **Bumper Season** | The first harvest you take each day pays double. | B |
| 7 | **Windfall Orchard** | The first crop you harvest each day also drops a chest. | B |
| 8 | **The Fallow Deed** | A plot left empty overnight yields double the next time you harvest it. | B |
| 9 | **The Cold Frame** | One crop in three ignores its grow time entirely and is ready the moment it goes in. | B |
| 10 | **The Long Furrow** | No crop of yours ever takes longer than eight hours. | A |
| 11 | **Kind Neighbour** | Every farm you rate rates you back the same day. | B |
| 12 | **The Seed Drill** | One harvest in four drops a second seed of what you planted. | B |
| 13 | **The Garden Path** | Decorations you place count twice toward your farm's rating. | A |

## Fishing

| # | Name | Effect | Class |
|---|---|---|---|
| 14 | **The Tide Table** | Casts you don't use roll over. Bank up to a week and spend the lot at once. | B |
| 15 | **The Fishmonger's Standing Order** | One fish in three sells at the price of the next rarity up. | B |
| 16 | **Two Hooks** | One cast in three lands a second fish. | B |
| 17 | **The Lantern** | Casts made while the shop is closed pay double. | A |
| 18 | **Stormglass** | One cast in three is treated as though it were raining over your water. | B |
| 19 | **Cold Bait** | Your first cast each day cannot land a common. | B |
| 20 | **The Full Creel** | Your daily casts refresh at noon as well as at midnight. | A |
| 21 | **The Chummed Water** | Every fifth cast is refunded. | B |
| 22 | **The Long Haul** | One fish in four comes up two tiers rarer than it rolled. | B |
| 23 | **The Gaff** | A fish that beats your record for its species refunds the cast. | B |
| 24 | **The Tithe of Scales** | Every fish you land also gives a random chest fragment. | B |
| 25 | **The Trawl** | One cast in five lands the whole tier — one of every fish at that rarity. | B |

## Sailing

| # | Name | Effect | Class |
|---|---|---|---|
| 26 | **Press-Ganged Crew** | Voyages finish in half the time. | A |
| 27 | **Twice-Landed** | Every voyage makes landfall twice — two dig sites where there was one. | A |
| 28 | **Deep Ballast** | Four more digs' worth of stamina on every voyage. | A |
| 29 | **Diviner's Rod** | Your first dig of every voyage uncovers a chest. | B |
| 30 | **The Shipwright's Debt** | Boat upgrades cost half. | A |
| 31 | **The Prize Court** | One encounter in three pays its doubloons twice. | B |
| 32 | **Letters of Marque** | An encounter you lose costs you no sortie. | B |
| 33 | **The Full Manifest** | One voyage in three returns with an item from the Quartermaster's locker. | B |
| 34 | **Beachhead** | One dig site in three is already half uncovered when you arrive. | B |
| 35 | **The Press Gang** | One voyage a day returns the moment you send it out. | B |
| 36 | **The Kraken's Toll** | Sea monsters you meet pay you to be left alone. | B |
| 37 | **Salvager's Claim** | One wreck in three leaves a piece of gear in your hold. | B |
| 38 | **Chartwright** | It takes half as many fragments to complete a chest. | A |

## The Depths

| # | Name | Effect | Class |
|---|---|---|---|
| 39 | **Shored Timbers** | The first collapse of each trip does nothing at all. | B |
| 40 | **The Long Vein** | One seam in three pays out twice over. | B |
| 41 | **The Assay Office** | Smelting costs half the ore. | A |
| 42 | **The Wide Seam** | One seam in three comes out a grade richer than it rolled. | B |
| 43 | **The Deep Key** | You start every descent five floors down. | A |
| 44 | **The Miner's Lamp** | Your trips start at the depth you reached last time, not at the top. | B |
| 45 | **The Deep Cart** | One trip in three brings back twice the ore. | B |
| 46 | **The Night Cage** | One extra trip a day, and the first bought trip costs nothing. | A |
| 47 | **Assayer's Eye** | One haul in three comes back at the best grade it contained. | B |
| 48 | **The Delver's Rope** | A dungeon run that ends badly does not count against your run for the day. | B |
| 49 | **The Warren Map** | Every dungeon run has one extra floor before the boss. | A |
| 50 | **The Gem Cutter's Eye** | One dungeon boss in two drops a gem. | B |

## The Kitchen

| # | Name | Effect | Class |
|---|---|---|---|
| 51 | **The Banked Fire** | Every third cook consumes no ingredients. | B |
| 52 | **The Hot Stone** | One cook in three comes out a tier better than the recipe. | B |
| 53 | **The Prep Bench** | One prep in three yields an extra ingredient. | B |
| 54 | **The Big Pot** | One cook in three makes more of whatever it made. | B |
| 55 | **The Head Chef** | A cook never pays the bottom rung. The consolation is off your ladder. | B |
| 56 | **The Tasting Menu** | One cook a day makes every dish you KNOW those ingredients could have made. | B |
| 57 | **The Standing Recipe** | Twice a day, a recipe may be cooked with any ingredients you hold. | B |
| 58 | **The Copper Pot** | One cook in four makes a second helping. | B |
| 59 | **The Cellar Key** | One harvest or landing in three puts a second copy in your pantry. | B |
| 60 | **The Substitution** | Three times a day, one ingredient a recipe asks for may be swapped for any other you hold. | B |
| 61 | **Chef's Pick** | One dish a day cooks at perfect timing without playing it. | B |

## The Forge & the Jewelcutter

| # | Name | Effect | Class |
|---|---|---|---|
| 62 | **The Cold Hammer** | Every third enhance consumes no parts. | B |
| 63 | **The Smith's Certainty** | An enhance that fails costs you nothing and may be tried again at once. | B |
| 64 | **Twice-Struck** | One salvage in three returns double parts. | B |
| 65 | **The Attuned Bench** | Every attunement you carry counts at double its level. | A |
| 66 | **The Jeweller's Eye** | Every gem you have set counts as one tier higher than it is. | A |
| 67 | **Jeweller's Patience** | One gem in three survives being pulled from its socket. | B |
| 68 | **The Steady Bench** | A failed fuse returns all three gems. | B |
| 69 | **The Master's Mark** | One enhance in three counts as two levels instead of one. | B |
| 70 | **The Reforging Right** | Reforging an element costs half. | A |
| 71 | **The Tempered Edge** | Your gear's enhancement bonuses count double. | A |
| 72 | **The Whetstone** | One enhance a day is a guaranteed critical success. | B |
| 73 | **The Deep Facet** | A gem set in any one piece gives its stat to every piece you are wearing. | B |

## The Town

| # | Name | Effect | Class |
|---|---|---|---|
| 74 | **Founder's Charter** | The travelling merchant sells to you at half price. | A |
| 75 | **The Plaza Key** | Town buildings you have not unlocked are open to you anyway. | A |
| 76 | **Patron of Works** | Gold you give to a town project counts double toward it. | A |
| 77 | **Market Day** | The travelling merchant restocks for you, on demand, once a day. | B |
| 78 | **The Warden's Key** | You may release one person from the Stockade each week. | B |
| 79 | **The Free Company** | Your spoils ceiling on a town raid is doubled. | A |
| 80 | **The Muster** | You may fight in a town raid from anywhere. You need not be stood in the plaza. | B |
| 81 | **The Toll House** | Every member who visits your farm pays you a toll — from the house, not from them. | B |
| 82 | **Standing Invitation** | Anyone may visit your farm without spending one of their daily visits. | B |

## Chests, the Wheel & the Daily

| # | Name | Effect | Class |
|---|---|---|---|
| 83 | **The Locksmith** | One chest in three opens a rarity higher. | B |
| 84 | **Twin Hinges** | One chest a day gives its rewards twice. | B |
| 85 | **The Free Spin** | Your first three spins each day cost nothing. | A |
| 86 | **Dealer's Choice** | Re-roll any wheel result once and keep whichever you prefer. | B |
| 87 | **The Standing Streak** | Your check-in streak never breaks. | A |
| 88 | **Day's Double** | Your daily check-in pays out twice. | B |
| 89 | **The Quartermaster's Round** | Every daily quest is issued one step already done. | B |
| 90 | **Bounty Board Rights** | You may take a fourth daily quest. | A |
| 91 | **The Master Key** | One chest in three also gives you the chest one tier below it, to open yourself. | B |
| 92 | **The Sorting Table** | A chest reward you already own comes out one rarity up instead. | B |
| 93 | **The Long Day** | Every daily allowance in the game is one larger. Every single one. | A |

## Pets

| # | Name | Effect | Class |
|---|---|---|---|
| 94 | **The Long Vigil** | Your equipped pet earns pet XP at triple the rate. | A |
| 95 | **The Full Trough** | One feed does the whole day — every meal at once. | B |
| 96 | **The Long Leash** | Your pet's ability keeps working while you are on someone else's farm. | B |
| 97 | **Breeder's Eye** | You choose which pet a random pet reward gives you. | B |
| 98 | **The Second Sitting** | One time in three, your equipped pet's ability fires twice. | B |
| 99 | **The Beast's Share** | Your equipped pet's ability works at the strength it would have one level higher. | A |
| 100 | **The Second Bowl** | Your equipped pet's passive counts twice toward the menagerie total. | A |
| 101 | **The Shepherd's Crook** | An enshrined pet's passive counts twice as well. | A |
| 102 | **The Long Table** | Your menagerie ceiling is half again as high. | A |
| 103 | **The Whistle** | Your pet keeps earning for a full hour after you swap it out. | B |

## Market, Trade & Credit

| # | Name | Effect | Class |
|---|---|---|---|
| 104 | **The Auctioneer's Seat** | You pay no auction fees, on either side. | A |
| 105 | **Merchant's Word** | Trades you offer never expire and never decay. | A |
| 106 | **The Standing Offer** | One item a day, the shop buys from you at the price it sells for. | B |
| 107 | **The Purser's Exchange** | Doubloons and laurels convert freely into one another. Gold stays out of it. | B |
| 108 | **The Bonded Warehouse** | Items you list at auction stay equipped and usable until they sell. | B |
| 109 | **The Merchant's Eye** | One daily deal each day is offered to you at half price. | A |
| 110 | **No Reserve** | An auction that does not sell is relisted for you, free, until it does. | B |
| 111 | **The Bulk Buyer** | One purchase in three from the gold shop comes in pairs. | B |
| 112 | **The Merchant's Ledger** | The travelling merchant's stock is twice as large for you. | A |

## Collections & Standing

| # | Name | Effect | Class |
|---|---|---|---|
| 113 | **The Completionist's Ledger** | One piece of a set counts as two toward its tier bonuses. | A |
| 114 | **Herald's Licence** | Your badges show on every screen in the game. | A |
| 115 | **The Loaned Exhibit** | One collection piece you do not own counts as owned. You choose which. | B |
| 116 | **The Seal of Office** | Collection capstones fire one piece short of the full set. | A |
| 117 | **The Long Service Record** | Every badge you hold pays its bonus twice. | A |
| 118 | **The Chronicle** | Anything you are first in the Den to do is written into the Live Feed under your name. | B |
| 119 | **The Founder's Plate** | One collection piece a week is delivered to you, chosen from what you are missing. | B |
| 120 | **The Standing Ovation** | Cheering pays you what it pays the hero you cheered. | B |

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
|---|---|---|---|
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
|---|---|---|---|
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
|---|---|---|---|
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

**The list is closed.** 120 entries, no duplicates, all bounded, all class A or B, none a tooltip, none minting
state that outlives the item, every one aimed at a mechanic that exists, and 29 of them now land on a roll.
