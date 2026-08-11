# 120 new signature powers — proposal

Drafted 2026-08-11. **Approved in principle by Luke** ("I love most of these, if not all of them"), with one
change requested: because they are so strong, **they should sit on higher-rarity items than the current
signature tiers**. Not yet assigned to items and not yet in code — `signatures.js` is untouched.

## The brief these were written to

- **Not combat. Not the boss.** The existing 31 signature mechanics are almost entirely damage procs, which is
  what made most marquee gear feel identical and left every system built after the boss fight — the farm, the
  kitchen, the Depths, sailing, the Forge, the Jewelcutter, the town — with nothing to chase.
- **Chunky. No percentages.** A signature is called a signature for a reason. These remove a limit, guarantee
  an outcome, add a slot, or double an output outright. Nothing here is "+8%".
- **No redundancy across the 120.** Each one does something mechanically distinct.
- **Equipped items are off limits.** 48 of the 120 items that currently carry a signature are equipped by
  somebody; those keep what they have. See the placement note at the bottom.

---

## The Farm

| # | Name | Effect |
|---|---|---|
| 1 | **Perennial Root** | Harvested crops replant themselves. You never spend a seed again. |
| 2 | **Hothouse Glass** | Every crop you plant is already one full growth stage in the moment it goes in the ground. |
| 3 | **Second Sowing** | Two extra plots on your farm, permanently. |
| 4 | **Nightsoil** | Fertilizer is never consumed. One bag lasts forever. |
| 5 | **The Pig's Standing Invitation** | The Loot Pig visits every single day, without a roll. |
| 6 | **Bumper Season** | One harvest a day pays double — and you pick which one, after you see it. |
| 7 | **Windfall Orchard** | The first crop you harvest each day also drops a chest. |
| 8 | **Seedvault** | Every seed you find arrives as a pair. |
| 9 | **Open Gate** | Farm visits no longer cost you a daily visit. Wander as much as you like. |
| 10 | **The Long Furrow** | Your crops finish overnight regardless of their grow time. Plant before bed, harvest at dawn. |
| 11 | **Kind Neighbour** | Every farm you rate rates you back the same day. |
| 12 | **Deep Loam** | One plot of your choosing grows anything in a quarter of the time. |
| 13 | **Gleaner's Right** | Harvesting on someone else's farm gives you a cut of it too. |

## Fishing

| # | Name | Effect |
|---|---|---|
| 14 | **The Tide Table** | Casts you don't use roll over. Bank up to a full week of them and spend the lot in one sitting. |
| 15 | **The Deep Register** | Every fish you land is recorded at its species' record length. |
| 16 | **Two Hooks** | Every cast lands two fish instead of one. |
| 17 | **Moonwater** | Night-fishing bonuses apply at every hour of the day. |
| 18 | **Stormglass** | It is always raining over your water, whatever the sky is doing. |
| 19 | **Unbreakable Leader** | No fish ever snaps your line, at any size. |
| 20 | **The Full Creel** | Your first cast each day lands the rarest fish in the water. |
| 21 | **Chum Barrel** | Every cast that lands a common fish immediately gives you a second cast. |
| 22 | **Cartographer's Float** | You can see what is under the water before you cast. |
| 23 | **The Set Line** | A second line fishes on its own while you are elsewhere — one fish an hour, straight into your pantry, up to eight while you sleep. |
| 24 | **The Tithe of Scales** | Every tenth fish you land turns into a treasure-chest fragment. |
| 25 | **Old Hand** | Fish you release come back bigger. Release one and the next is a size up. |

## Sailing

| # | Name | Effect |
|---|---|---|
| 26 | **Sealed Orders** | Voyages complete the instant you launch them. |
| 27 | **The Standing Crew** | Two voyages can be at sea at once. |
| 28 | **Bottomless Hold** | Your dig stamina never depletes. Dig the whole map. |
| 29 | **Diviner's Rod** | Your first dig of every voyage always uncovers a chest. |
| 30 | **The Shipwright's Debt** | Boat upgrades cost you nothing — the yard works on credit that is never called in. |
| 31 | **Salt Ledger** | Doubloons you spend at the Quartermaster are refunded the next morning. |
| 32 | **Reading the Weather** | You see every encounter on the route before you sail, and may decline one. |
| 33 | **The Full Manifest** | Every voyage returns with one item from the Quartermaster's locker, free. |
| 34 | **Beachhead** | Buried finds are already dug — a dig reveals the whole grid at once. |
| 35 | **Following Star** | You may sail at any hour and arrive at the hour you choose. |
| 36 | **The Kraken's Toll** | Sea monsters you meet pay YOU to be left alone. |
| 37 | **Salvager's Claim** | Every wreck you pass leaves a piece of gear in your hold. |
| 38 | **Chartwright** | Fragments you find always complete the chest you are closest to finishing. |
| 39 | **The Second Anchor** | A voyage that finds nothing is not spent — it goes back on your allowance. |

## The Depths

| # | Name | Effect |
|---|---|---|
| 40 | **Shored Timbers** | The roof never collapses on you. Mine until you decide to leave. |
| 41 | **The Long Vein** | Every seam you crack pays out twice over. |
| 42 | **Cold Furnace** | Smelting costs no ore. Feed it nothing and it still pours. |
| 43 | **Lodestone Heart** | You can see every seam on the level the moment you arrive. |
| 44 | **The Deep Key** | You start every descent ten floors down. |
| 45 | **Miner's Pension** | Ore you lose to a collapse is delivered to you the following day anyway. |
| 46 | **Second Pick** | Every swing cracks two seams. |
| 47 | **The Dowsing Chain** | The richest seam on a floor lights up and stays lit until you take it. |
| 48 | **Bedrock Claim** | One seam is yours in perpetuity. It is waiting on every trip, already cracked, at the richest grade the floor can hold. |
| 49 | **Assayer's Eye** | Ore is sorted for you — every haul comes back as the best grade it contained. |
| 50 | **The Dungeon Ledger** | Dungeon bosses may be fought again the same day. |
| 51 | **Cavernlight** | Dungeon floors are revealed as you enter, traps and all. |
| 52 | **The Bell of the Fourth Level** | One floor a day, everything you break drops a gem. |

## The Kitchen

| # | Name | Effect |
|---|---|---|
| 53 | **The Standing Pot** | Cooking never consumes ingredients. |
| 54 | **Iron Palate** | Every dish you cook comes out at the highest tier. |
| 55 | **The Second Table** | Two dishes cook at once. |
| 56 | **Grandmother's Book** | You know every recipe in the game the moment you equip this. |
| 57 | **Mise en Place** | Prepping is skipped entirely — ingredients arrive prepped. |
| 58 | **The Long Larder** | Cooked dishes never expire and never lose their buff. |
| 59 | **Baker's Dozen** | Every cook produces a spare portion you can give away. |
| 60 | **The Tasting Spoon** | You see exactly what a dish will produce before you commit the ingredients. |
| 61 | **Feast Day** | One cook a day feeds the whole Den — everyone online gets the dish's buff. |
| 62 | **The Tasting Menu** | One cook a day produces every dish those ingredients could have made, not only the one you chose. |
| 63 | **The Recipe Hunter's Nose** | Any activity that can drop a recipe drops one, every time, until you have them all. |

## The Forge & the Jewelcutter

| # | Name | Effect |
|---|---|---|
| 64 | **Cold Anvil** | Enhancing never consumes parts. |
| 65 | **The Smith's Certainty** | Enhancement never fails and never downgrades. |
| 66 | **Whole Salvage** | Salvaging returns the item's parts AND leaves the item intact. |
| 67 | **The Transmuter's Hand** | Combining parts always yields the next tier up, twice over. |
| 68 | **Attuning Fire** | Every enhance rolls an attunement. Every single one. |
| 69 | **The Fourth Socket** | Every piece of gear you own gains an extra socket. |
| 70 | **Jeweller's Patience** | Gems come back out of a socket free, and unbroken. |
| 71 | **The Perfect Cut** | Fusing three gems always produces the next tier — no failed fuse, ever. |
| 72 | **Wolf's Eye Sight** | You can see which gem a seam or chest is holding before you open it. |
| 73 | **Master's Mark** | Anything you forge is bound to you and can never be traded away by mistake. |
| 74 | **The Reforging Right** | Reforging an element is free and may be repeated until you like the result. |
| 75 | **Scrapwright** | Junk gear in your bags salvages itself, overnight, into parts. |
| 76 | **The Standing Order** | The Forge works while you are away — one enhance completes every day whether you visit or not. |

## The Town

| # | Name | Effect |
|---|---|---|
| 77 | **Founder's Charter** | The travelling merchant sells to you at cost. |
| 78 | **The Plaza Key** | Town buildings you have not unlocked are open to you anyway. |
| 79 | **Patron of Works** | Gold you contribute to a town project counts twice toward it and is returned to you. |
| 80 | **The Crier's Bell** | You may broadcast one message a day to everyone in the Den. |
| 81 | **Sharp Eyes** | The shiny glint in the plaza is always visible to you, and never taken first. |
| 82 | **Right of Sanctuary** | You cannot be put in the Stockade. |
| 83 | **The Warden's Key** | You may release one person from the Stockade each week. |
| 84 | **Guildhall Standing** | Your name sits permanently at the top of the plaza roster. |
| 85 | **The Open Door** | You may visit any member's farm, deck or den without an invitation. |
| 86 | **Market Day** | The travelling merchant restocks for you personally, on demand, once a day. |

## Chests, the Wheel & the Daily

| # | Name | Effect |
|---|---|---|
| 87 | **The Locksmith** | Every chest you open opens one rarity higher. |
| 88 | **Twin Hinges** | Every chest gives its rewards twice. |
| 89 | **The Unspent Spin** | Wheel spins are never consumed. Spin all day. |
| 90 | **Dealer's Choice** | You may re-roll any wheel result once, and keep whichever you prefer. |
| 91 | **The Standing Streak** | Your check-in streak never breaks, even on days you do not appear. |
| 92 | **Day's Double** | Your daily check-in pays out twice. |
| 93 | **The Quartermaster's Round** | Every daily quest completes one step for free the moment it is issued. |
| 94 | **Bounty Board Rights** | You may take a fourth daily quest. |
| 95 | **The Glass Chest** | You see a chest's contents before you decide to open it. |
| 96 | **Hoarder's Blessing** | Unopened chests multiply — every one left closed overnight becomes two. |
| 97 | **The Last Word** | Once a day, refuse a reward you did not want and roll it again. |

## Pets

| # | Name | Effect |
|---|---|---|
| 98 | **The Whole Kennel** | Every pet you own earns XP, not just the one you carry. |
| 99 | **The Second Collar** | You may equip two pets at once. |
| 100 | **Feast for the Pack** | Feeding one pet feeds them all. |
| 101 | **The Shrine Keeper** | Stones you spend enshrining are returned to you. |
| 102 | **Twin Souls** | One pet may be enshrined with BOTH stones. |
| 103 | **The Long Leash** | Your equipped pet's ability works even when the pet is on someone else's farm. |
| 104 | **Breeder's Eye** | You may choose which pet a random pet reward gives you. |
| 105 | **The Menagerie Deed** | Pets you gift away stay yours as well. |
| 106 | **First Light** | Every pet you unlock arrives at level three. |
| 107 | **The Beastspeaker's Pact** | Your pets level while you are logged out, all night, every night. |

## Market, Trade & Credit

| # | Name | Effect |
|---|---|---|
| 108 | **The Auctioneer's Seat** | You pay no auction house fees, on either side. |
| 109 | **Right of First Refusal** | You see every auction one hour before anyone else does. |
| 110 | **The Sealed Bid** | One auction a week is yours at the opening price, uncontested. |
| 111 | **Merchant's Word** | Trades you offer never expire and never decay. |
| 112 | **The Honest Broker** | You may inspect the full value of anything offered to you in a trade. |
| 113 | **The Purser's Exchange** | Doubloons and laurels convert freely into one another. Gold stays out of it — you earn far more of that, on purpose. |
| 114 | **The Standing Account** | Store credit you spend in-store is refunded as game coins at full value. |
| 115 | **Vaultwright** | You may keep a second full loadout and swap your whole kit between them instantly, at any time. |

## Collections, Badges & Standing

| # | Name | Effect |
|---|---|---|
| 116 | **The Completionist's Ledger** | Owning one piece of a set counts as owning two toward its bonuses. |
| 117 | **Herald's Licence** | Your badges are visible on every screen in the game, to everyone. |
| 118 | **The Founder's Seal** | Any collection you complete grants its capstone permanently, even if you sell the pieces. |
| 119 | **Chronicle Rights** | Everything you do is written into the Live Feed with your own wording. |
| 120 | **The Long Memory** | Nothing you own is ever lost to a reset, a decay, or a season roll. |

---

## Already resolved (2026-08-11)

| # | Was | Now | Why |
|---|---|---|---|
| 14 | Endless Line | **The Tide Table** | Uncapped casts. The game prices 6 extra casts at 6,300 gold — this deleted the ceiling rather than raising it. |
| 23 | Ice Auger | **The Set Line** | **Dead.** Fishing has no location gate, so there was nothing to remove. |
| 48 | Nightshift | **Bedrock Claim** | Uncapped mining, and the Depths are the only source of gems — it would have unmetered the Jewelcutter downstream. |
| 62 | Cold Store | **The Tasting Menu** | **Dead.** The pantry has no cap; it is a plain quantity table. The limit was always supply, never storage. |
| 113 | Coin of the Realm | **The Purser's Exchange** | Merging gold in made both hard currencies gold-buyable. Doubloons ↔ laurels only, per Luke. |
| 115 | Deep Pockets | **Vaultwright** | **Dead.** No bag cap, no vault cap, no inventory limit exists anywhere in the codebase. |

## Risk register — the rest of the 120

Nothing below has been changed. These need a call before any of them are written into an item.

### A. Unbounded or self-compounding — would need a rewrite to ship

| # | Power | The loop |
|---|---|---|
| 21 | Chum Barrel | A common fish grants another cast. Commons are the bulk of the water, so casts may never go down — Endless Line by the back door. |
| 25 | Old Hand | A released fish comes back a size up. Release and re-release repeats forever with no ceiling. |
| 26 | Sealed Orders | Instant voyages. Time is what caps sailing; removing it uncaps digs, doubloons and encounters at once. |
| 28 | Bottomless Hold | Dig stamina never depletes. Same shape — the stamina IS the dig budget. *(Flagged in the first pass, then dropped from "the four" by mistake.)* |
| 31 | Salt Ledger | Doubloons refunded the next morning. You keep the goods and the money — the Quartermaster becomes free forever. |
| 42 | Cold Furnace | Smelting costs no ore. Parts out of nothing. |
| 66 | Whole Salvage | Salvage returns the parts AND keeps the item. One item salvages forever. |
| 67 | The Transmuter's Hand | Always the next tier, twice over. Feed the output back in and parts escalate without limit. |
| 79 | Patron of Works | Contribution counts double AND is refunded. Town projects fund themselves. |
| 89 | The Unspent Spin | Spins are never consumed. The wheel is a daily reward with no per-spin cost. |
| 96 | Hoarder's Blessing | Unopened chests double overnight. Exponential, and chests are the widest reward vector in the game. |
| 101 | The Shrine Keeper | Stones are returned. Stones are a deliberate three-week chase; this makes the first one the last one you need. |
| 105 | The Menagerie Deed | Gifted pets stay yours. Pet duplication, and pet sharing is once-per-member by design. |
| 118 | The Founder's Seal | Keep the capstone after selling the pieces. Sell, rebuy, repeat. |

### B. Bounded, but they delete a chase or a designed tension

| # | Power | What it deletes |
|---|---|---|
| 40 + 45 | Shored Timbers, Miner's Pension | Both negate a collapse. Collapse is the risk half of the Depths' risk/reward — and the two are redundant with each other. |
| 52 | The Bell of the Fourth Level | A floor of guaranteed gems a day. Gems are mined-only on purpose. |
| 53 | The Standing Pot | Ingredients are the kitchen's meter. |
| 56 + 63 | Grandmother's Book, The Recipe Hunter's Nose | Both end the recipe collection outright, and they overlap each other. |
| 64 | Cold Anvil | Parts are the Forge's meter. |
| 71 | The Perfect Cut | "Past Polished the odds turn hard on purpose, so a Flawless is a story rather than a Tuesday." This makes it a Tuesday. |
| 72 | Wolf's Eye Sight | May leak the secret sixth gem before anyone has found it. |
| 98 + 100 | The Whole Kennel, Feast for the Pack | Level six is built on "only the pet you carry earns, so you must choose one companion." This is the opposite of that, twice. |
| 102 | Twin Souls | Undoes the permanent stone choice the enshrining panel makes you confirm. |

### C. Takes something from other members — social, not economic

| # | Power | Concern |
|---|---|---|
| 81 | Sharp Eyes | The plaza glint is a first-come contest between members. This makes one person always win it. |
| 109 | Right of First Refusal | An hour's head start on every auction is a licence to snipe the whole market. |
| 110 | The Sealed Bid | Takes an auction off the people bidding on it. |
| 84 | Guildhall Standing | A permanent top-of-roster is a leaderboard that lies. |
| 82 | Right of Sanctuary | Immunity from the Stockade, which is a social mechanic the town votes on. |
| 85 | The Open Door | Visiting without an invitation is a privacy decision, not a power. |
| 61, 80, 119 | Feast Day, The Crier's Bell, Chronicle Rights | All three reach other people. The two broadcast ones need `text-filter.js` and a rate limit; Feast Day needs a cap. |

### D. Touches real money

| # | Power | Concern |
|---|---|---|
| 114 | The Standing Account | Store credit is bought with real dollars. Refunding it as game coins at full value while the credit is still spent is a real-money giveaway, not an item bonus. Needs a hard cap or a rewrite. |

### E. Redundant pairs to merge or re-cut

- **1 Perennial Root / 8 Seedvault** — both solve seed supply.
- **9 Open Gate + 13 Gleaner's Right** — unlimited visits multiplied by paid harvests on other people's farms.
- **95 The Glass Chest + 97 The Last Word** — see the contents, then refuse and reroll: together they let you pick your reward.
- Plus **40/45**, **56/63** and **98/100** noted above.

## Placement note (as of 2026-08-11)

306 items exist. 130 are unequipped by anybody and therefore free to change; of those, 72 already carry a
signature and 58 do not. **Only 72 of the free items are legendary or better** — matching Luke's note that
these powers deserve higher-tier items, the honest options are to mint new high-rarity items to carry them
(his stated plan) or to let signatures reach further down the rarity ladder.
