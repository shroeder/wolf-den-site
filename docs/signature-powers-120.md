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
| 1 | **Perennial Root** | Every harvest returns the seed you planted. | B |
| 2 | **Hothouse Glass** | Crops go into the ground already one full growth stage along. | B |
| 3 | **Second Sowing** | Two extra plots, permanently. | A |
| 4 | **Nightsoil** | Fertilizer is never consumed. | B |
| 5 | **The Pig's Standing Invitation** | The Loot Pig comes every day, without a roll. | A |
| 6 | **Bumper Season** | Your largest harvest each day pays double. | B |
| 7 | **Windfall Orchard** | The first crop you harvest each day also drops a chest. | B |
| 8 | **The Fallow Deed** | One plot on your farm always yields twice. | A |
| 9 | **Harvest Home** | Harvesting a plot replants the same crop immediately, free. | B |
| 10 | **The Long Furrow** | No crop of yours ever takes longer than eight hours. | A |
| 11 | **Kind Neighbour** | Every farm you rate rates you back the same day. | B |
| 12 | **The Almanac** | You see a seed's exact yield before you plant it. | B |
| 13 | **Terrace Farming** | Your farm holds twice as many decorations. | A |

## Fishing

| # | Name | Effect | Class |
|---|---|---|---|
| 14 | **The Tide Table** | Casts you don't use roll over. Bank up to a week and spend the lot at once. | B |
| 15 | **The Fishmonger's Standing Order** | Fish you land sell at the price of the next rarity up. | A |
| 16 | **Two Hooks** | Every cast lands two fish. | B |
| 17 | **Moonwater** | Night-fishing bonuses apply at every hour of the day. | A |
| 18 | **Stormglass** | It is always raining over your water, whatever the sky is doing. | A |
| 19 | **Unbreakable Leader** | No fish ever snaps your line, at any size. | B |
| 20 | **The Full Creel** | Your first cast each day lands the rarest fish in the water. | B |
| 21 | **The Chummed Water** | Every fifth cast is refunded. | B |
| 22 | **Cartographer's Float** | You see what is under the water before you cast. | B |
| 23 | **The Gaff** | Landing a record fish refunds the cast and pays its bonus twice. | B |
| 24 | **The Tithe of Scales** | Every tenth fish you land becomes a treasure-chest fragment. | B |
| 25 | **Deep Water Licence** | The rarest tier of fish can appear on any cast, not only at depth. | A |

## Sailing

| # | Name | Effect | Class |
|---|---|---|---|
| 26 | **Press-Ganged Crew** | Voyages finish in half the time. | A |
| 27 | **The Sounding Line** | A dig site shows how many finds it holds before you spend a shovel. | B |
| 28 | **Deep Ballast** | Four more digs' worth of stamina on every voyage. | A |
| 29 | **Diviner's Rod** | Your first dig of every voyage uncovers a chest. | B |
| 30 | **The Shipwright's Debt** | Boat upgrades cost you nothing. | A |
| 31 | **The Prize Court** | Every encounter you win pays a second time in doubloons. | B |
| 32 | **Reading the Weather** | You see every encounter on the route before you sail, and may decline one. | B |
| 33 | **The Full Manifest** | Every voyage returns with one item from the Quartermaster's locker, free. | B |
| 34 | **Beachhead** | A dig reveals the whole grid at once. | B |
| 35 | **Following Star** | You choose the hour a voyage returns. | B |
| 36 | **The Kraken's Toll** | Sea monsters you meet pay you to be left alone. | B |
| 37 | **Salvager's Claim** | Every wreck you pass leaves a piece of gear in your hold. | B |
| 38 | **Chartwright** | Fragments always complete the chest you are closest to finishing. | B |

## The Depths

| # | Name | Effect | Class |
|---|---|---|---|
| 39 | **Shored Timbers** | The first collapse of each trip does nothing at all. | B |
| 40 | **The Long Vein** | Every seam you crack pays out twice over. | B |
| 41 | **The Assay Office** | Smelting costs half the ore. | A |
| 42 | **Lodestone Heart** | Every seam on the level is visible the moment you arrive. | B |
| 43 | **The Deep Key** | You start every descent ten floors down. | A |
| 44 | **Second Pick** | Every swing cracks two seams. | B |
| 45 | **The Dowsing Chain** | The richest seam on a floor stays lit until you take it. | B |
| 46 | **The Night Cage** | One extra trip a day, and the first bought trip costs nothing. | A |
| 47 | **Assayer's Eye** | Every haul comes back at the best grade it contained. | B |
| 48 | **The Dungeon Ledger** | Dungeon bosses may be fought twice a day. | A |
| 49 | **Cavernlight** | Dungeon floors are revealed as you enter, traps and all. | B |
| 50 | **The Gem Cutter's Eye** | Every dungeon boss drops a gem. | B |

## The Kitchen

| # | Name | Effect | Class |
|---|---|---|---|
| 51 | **The Banked Fire** | Every third cook consumes no ingredients. | B |
| 52 | **Iron Palate** | Every dish you cook comes out at the highest tier. | B |
| 53 | **Mise en Place** | Ingredients arrive prepped. Prepping is skipped. | B |
| 54 | **The Long Larder** | Cooked dishes never expire and never lose their buff. | A |
| 55 | **The Tasting Spoon** | You see exactly what a dish will produce before you commit the ingredients. | B |
| 56 | **The Tasting Menu** | One cook a day makes every dish those ingredients could have made. | B |
| 57 | **The Standing Recipe** | One recipe of your choosing can be cooked with any ingredients. | B |
| 58 | **The Copper Pot** | Every dish makes a second helping. | B |
| 59 | **The Cellar Key** | Every harvest and every landing puts a second copy in your pantry. | B |
| 60 | **The Menu Board** | You see which recipes you are missing and where each one drops. | B |
| 61 | **Chef's Pick** | One dish a day cooks at perfect timing without playing it. | B |

## The Forge & the Jewelcutter

| # | Name | Effect | Class |
|---|---|---|---|
| 62 | **The Cold Hammer** | Every third enhance consumes no parts. | B |
| 63 | **The Smith's Certainty** | Enhancement never fails and never downgrades. | B |
| 64 | **Twice-Struck** | Salvage returns double parts. | A |
| 65 | **Attuning Fire** | Every enhance rolls an attunement. | A |
| 66 | **The Fourth Socket** | Every piece of gear you own gains an extra socket. | A |
| 67 | **Jeweller's Patience** | Gems come back out of a socket free, and unbroken. | B |
| 68 | **The Steady Bench** | A failed fuse returns all three gems. | B |
| 69 | **Master's Mark** | Anything you forge is bound to you and can never be traded away by mistake. | A |
| 70 | **The Reforging Right** | Reforging an element is free and may be repeated. | A |
| 71 | **The Grading Loupe** | You see an enhance's result and its attunement odds before you commit. | B |
| 72 | **The Whetstone** | One enhance a day is a guaranteed critical success. | B |
| 73 | **The Socket Punch** | Sockets can be cut into an item of any rarity. | A |

## The Town

| # | Name | Effect | Class |
|---|---|---|---|
| 74 | **Founder's Charter** | The travelling merchant sells to you at cost. | A |
| 75 | **The Plaza Key** | Town buildings you have not unlocked are open to you anyway. | A |
| 76 | **Patron of Works** | Gold you give to a town project counts double toward it. | A |
| 77 | **Market Day** | The travelling merchant restocks for you, on demand, once a day. | B |
| 78 | **The Warden's Key** | You may release one person from the Stockade each week. | B |
| 79 | **The Bell Tower** | You know a raid, a boss or an event is coming an hour before it is announced. | B |
| 80 | **The Guild Ledger** | You can see any member's public loadout and collection progress. | B |
| 81 | **The Toll House** | Every member who visits your farm pays you a toll — from the house, not from them. | B |
| 82 | **Standing Invitation** | Anyone may visit your farm without spending one of their daily visits. | B |

## Chests, the Wheel & the Daily

| # | Name | Effect | Class |
|---|---|---|---|
| 83 | **The Locksmith** | Every chest you open opens one rarity higher. | A |
| 84 | **Twin Hinges** | One chest a day gives its rewards twice. | B |
| 85 | **The Free Spin** | Your first three spins each day cost nothing. | A |
| 86 | **Dealer's Choice** | Re-roll any wheel result once and keep whichever you prefer. | B |
| 87 | **The Standing Streak** | Your check-in streak never breaks. | A |
| 88 | **Day's Double** | Your daily check-in pays out twice. | B |
| 89 | **The Quartermaster's Round** | Every daily quest is issued one step already done. | B |
| 90 | **Bounty Board Rights** | You may take a fourth daily quest. | A |
| 91 | **The Glass Chest** | You see a chest's contents before you decide to open it. | B |
| 92 | **The Sorting Table** | A chest reward you already own comes out one rarity up instead. | B |
| 93 | **The Long Weekend** | Every daily allowance in the game refreshes on Saturday as well as at midnight. | A |

## Pets

| # | Name | Effect | Class |
|---|---|---|---|
| 94 | **The Long Vigil** | Your equipped pet earns pet XP at triple the rate. | A |
| 95 | **The Full Trough** | One feed does the whole day — every meal at once. | B |
| 96 | **The Long Leash** | Your pet's ability keeps working while you are on someone else's farm. | B |
| 97 | **Breeder's Eye** | You choose which pet a random pet reward gives you. | B |
| 98 | **First Light** | Every pet you unlock arrives at level three. | A |
| 99 | **The Kennel Book** | You see every pet's ability and both of its stones before you own it. | B |
| 100 | **The Second Bowl** | Your equipped pet's passive counts twice toward the menagerie total. | A |
| 101 | **The Shepherd's Crook** | An enshrined pet's passive counts twice as well. | A |
| 102 | **Ancestral Line** | Every pet you own gains one level, once, the day you equip this. | B |
| 103 | **The Whistle** | Swapping your equipped pet costs nothing and has no cooldown. | A |

## Market, Trade & Credit

| # | Name | Effect | Class |
|---|---|---|---|
| 104 | **The Auctioneer's Seat** | You pay no auction fees, on either side. | A |
| 105 | **Merchant's Word** | Trades you offer never expire and never decay. | A |
| 106 | **The Honest Broker** | You see the full value of anything offered to you in a trade. | B |
| 107 | **The Purser's Exchange** | Doubloons and laurels convert freely into one another. Gold stays out of it. | B |
| 108 | **The Bonded Warehouse** | Items you list at auction stay equipped and usable until they sell. | B |
| 109 | **The Assay Stamp** | Any listing shows its true worth — attunement, gems and enhancement included. | B |
| 110 | **No Reserve** | Your auctions may be listed with no minimum; the house guarantees the floor. | B |
| 111 | **The Ledger Seat** | You can see the full sale history of any item in the Den. | B |
| 112 | **The Merchant's Ledger** | The daily deal refreshes for you a second time each day. | B |

## Collections & Standing

| # | Name | Effect | Class |
|---|---|---|---|
| 113 | **The Completionist's Ledger** | One piece of a set counts as two toward its tier bonuses. | A |
| 114 | **Herald's Licence** | Your badges show on every screen in the game. | A |
| 115 | **The Archivist** | You see exactly what you are missing from every collection, and where it drops. | B |
| 116 | **The Seal of Office** | Collection capstones fire one piece short of the full set. | A |
| 117 | **The Long Service Record** | Every badge you hold pays its bonus twice. | A |
| 118 | **The Chronicle** | Anything you are first in the Den to do is written into the Live Feed under your name. | B |
| 119 | **The Founder's Plate** | Your profile carries your join date and every first you still hold. | B |
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

## Settled

**Attuning Fire (65)**, **The Long Weekend (93)** and **The Seal of Office (116)** were flagged as the three
survivors worth a second look. Luke's call, 2026-08-11: all three stand as written.

Recorded here rather than left implicit, because each one is a deliberate exception to a rule the game
otherwise enforces — a 10x on a chance that was cut to 0.4x three days earlier, a change to every daily
allowance at once, and a capstone that fires before its set is complete. If any of the three later looks wrong
in play, it was chosen, not overlooked.

**The list is closed.** 120 entries, every one bounded and every one class A or B.
