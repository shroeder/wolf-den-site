# The Grove — Luke's feedback backlog

Started 2026-10-30. **Luke: *"I'm just going to keep queuing up for you, and I expect you to continually
work through this backlog. But, like, also make notes of all the things I'm telling you so that if we lose
this session, we don't lose all this feedback."***

⚠️ **THIS FILE IS THE RECORD, NOT THE SESSION.** Everything below is his words or a faithful compression of
them. Append new feedback at the bottom of its section as it arrives; mark items done with the commit that
did it. Do not delete an item when it ships — a struck item is the proof it was heard.

---

## Done

| # | What | Shipped |
|---|---|---|
| 1 | The left menu carries live counts, so a shut menu says there is something inside | `a3e748a7` |
| 2 | Monster Cards: no more equipping — possession grants the bonus at its level, always | `89873df5` |
| 3 | Class moves out of the Monster Cards area into its own menu item (Go / Carry / Make / **Train**) | `89873df5` |
| 4 | The cards-vs-card-game blurb deleted; the word "Spire" gone from the Grove entirely | `89873df5` |
| 5 | The Grove sits second in the site menu strip, with a real sprite instead of an oak-leaf glyph | `199fc248` |
| 6 | ⚠️ The bellows timer reset on every tap — armed once now, deaf to taps (item G) | `12f84ec8` |
| 7 | The craft-ready note moves off the play area to the left edge, beside the menu it is pointing at | `096ec0a8` |
| 8 | Grove "Leave" goes to the game home, not the shop's landing page | `8dc5bb1e` |
| 9 | ⚠️ Signing out signed you straight back in — the bridged /shop session was never cleared | `da4a10b2` |
| 10 | Bellows: a burst of embers on every pump, coloured by how hot the fire is (item I) | `(this)` |
| 11 | Plinko: the rack is viewport-tall instead of a fixed 150px (item E) | `(this)` |
| 12 | Plinko: a colourful ball falls, not the item, and the splash is 24 shards (item F) | `1fe97693` |
| 13 | ⚠️ "Craft N" plays the act once and forges the whole batch against it (half of item J) | `f33de06d` |
| 14 | A batch stepper — pick any amount from 2 up to what the parts allow (the other half of J) | `1ac05a5a` |
| 15 | "Show me where it went" on the craft card — takes you to the shelf and flashes it (part of D) | `a44dbc78` |
| 16 | Inventory shelves collapse, and the choice survives leaving the panel (part of D) | `(this)` |
| 17 | A tool shows the quality band it was forged at — it was in the payload and on no screen | `d7b34e0f` |
| 18 | A door back into the Grove on the Town page — the dead end is gone (half of item A) | `cf8ff9ec` |
| 19 | ⚠️ REGRESSION FIX: dropping the Plinko ball on a batch closed the act and cried failure | `3ac5a2a6` |
| 20 | Ten crafting minigames, a pool, and an owner bench to play them on (item C, built) | `ef29f766` |
| 21 | The act draws three of the ten and plays them — wired into the real craft, not a demo | `(this)` |

---

## Open — the big ones

### A. Town should not evict you from the Grove
> *"if you go to town, you completely get booted out of the Grove. Like, the whole experience is lost. You
> have to go all the way back into the menu to find the Grove again… When you go to a town, it shouldn't be
> like that. You should still be a part of the Grove… when you're in the town, it should be like you're in
> any other zone of the Grove with the menu on the left and still in that experience, at least when it goes
> ungated."*

**Half done** (`18` above). The Grove sends people to Town from two places — the town button in a zone and
dying — and both were hard navigations into a page with **no route back**; the only way home was the site
menu, on a strip the Grove hides while you are in it. The Town page now carries a fixed door on the left
edge, at the same height as the Grove's own menu handle, shown only to players `groveOpen` lets in.

**DONE** (`29`) — the bigger half as well. Town is a VIEW of the Grove now, in the Go family beside Map and
Quests, with the Grove's menu handle down the left edge over the street. The two hard navigations that used
to tear the Grove down — the town button in a zone and dying — are `setView("town")`.

`TownClient` mounts unchanged. It takes plain props and paints itself, so a Grove copy of the street would
have been a second street to keep in step with the first — the same call as the Arena's skill tree in the
class room.

Three things it needed:
- ⚠️ **Fetched when opened, never with the Grove.** `getTownState` is the highest-volume request in the
  app by TownClient's own account; computing it on the Grove's server render would bill it for everyone who
  opens the forest and never walks to the street. That is the family-A mistake CLAUDE.md opens with.
- ⚠️ **Dynamically imported, `ssr: false`.** 5,500 lines with their own camera, polling and stylesheet,
  which would otherwise ride in the Grove's bundle for every player who never leaves the forest.
- ⚠️ **`top: 58px`.** Flush to the top, the Grove's own back arrow sat directly on the words "Wolf Den
  Town" — the Grove's chrome and the room's chrome in the same 44px.

The menu sprite is the nav's existing town art. `no-icons-or-glyphs-in-the-game` asks for a sprite, not for
a new one, and drawing a second town would be money for a picture of a thing that has a picture.

`/marketplace/town` still stands on its own for anyone arriving from the site nav, with the Grove door that
shipped as `18`.

### B. The class tree must be playable from inside the Grove
> *"we need to make it super clear, like the whole class tree and everything, that all that needs to also
> live in a menu in the Grove, because people don't understand what the abilities are doing and what their
> class selection and their point class points are doing when it comes to the Grove. And it shouldn't just
> explain it in a text blob. It should be very dopamine inducing, and like, you should be able to make class
> selections and tree decisions from that same area in the Grove."*

**DONE** (`23`). The room is fully playable now. Above the fold it still answers "what is my class worth
*here*" — the readout measured against the Grove's own engine, which is the part the Arena never had. Below
it sit the Arena's real `SkillTree` and `SkillPanel`, mounted unchanged: pick a class, take a node, refund
one, respec the whole tree, spend skill points. All of it from the Grove, none of it a copy.

Mounted rather than rebuilt on purpose — a second tree that spends gold and points is a second place for the
spending rules to drift, and the Arena's is already the tuned, dopamine-inducing one Luke means. Two things
made that safe: they carry their own `<style jsx global>`, so they arrive dressed wherever they mount, and
they take `gold` as a prop — fed from the Grove's own balance, so the respec price shown is the price
charged. Verified by driving the real room, not by a green build.

### C. Crafting minigames: a pool of ten, three at random
> *"The crafting minigame sucks. I think that it should, instead of being deterministic, it should be
> random. It should pull from, like, let's say 10 different kind of mini games, and I expect you to make all
> the mini games up, and they all have to look amazing and beautiful, and you have to be proud of it, and
> they all have to be super clear. So it'll pull from a pool of 10 mini games randomly, and it'll pull three
> of them, and there's clearly three phases."*

**BUILT, THEN REMOVED — 2026-11-04.** Luke: *"I want to remove the crafting minigame ... I would love to
just remove all the crafting minigames from the Groves crafting ... for now I'm going to tell you to just
have it randomly select variance while I figure out what to replace it with."*

So this item is **open again, not done**, and the ten games, the three-beat act and the plinko rack are
deleted rather than parked behind a flag. Quality is rolled server-side from the crafting level alone.

> ⚠️ **Do not rebuild this from the quote above.** It is the brief that produced the thing Luke removed.
> What a replacement has to beat is on the record: the act's own honesty (the ball's landing *was* the
> quality, not an animation over a number decided elsewhere), and its two real costs — a performance the
> server could never verify, and ten crafts needing ten performances. The deleted code is at `04f9be33`.

### D. A full usability pass on the inventory
> *"when you're looking at your inventory, you can't collapse things… when you craft something, we need a
> modal that pops up telling you exactly what you crafted and why it matters and what the stats are. And
> then we also need the ability to go see where to go look at the item, because people have no idea where to
> go after they craft it. Like, it's just completely like disappeared. And you can't even like inspect the
> tools in your tools area. I feel like when you're in the inventory, like we just need to do a lot better
> job letting people inspect things… You need to do a full pass on that."*

Four named pieces:

- ~~a **craft-result modal**~~ — one already existed and shows the name, the quality roll, the art, what it
  does, what it cost and the crafting level. Left as it was.
- ~~a **take me to it** route~~ — DONE (`15` above). The card now carries "Show me where it went", which
  switches to the bag panel, scrolls to the right shelf and flashes it. `GroveArea` had been taking an `id`
  and rendering it only as a className, so nothing could ever have scrolled to one.
- ~~**collapsible sections**~~ — DONE (`16`). Every shelf collapses from its heading, and the open/shut
  choice is stored, because the bag panel unmounts whenever you open the map or the bench — component state
  alone would have reopened everything and read as broken.
- ~~**inspectable tools**~~ — DONE (`17`, then `27`). The quality band went onto the tool first, which was
  the biggest miss: `toolMeta` had carried `quality` since it was written and no screen showed it, so the
  one thing the crafting act exists to decide was invisible on the thing it decided. Tapping a tool now
  opens its own sheet.

  ⚠️ **A TIER AND A BAND ARE TWO LADDERS AND THE SHELF WAS MULTIPLYING THEM INTO ONE NUMBER.** The tier
  is what the tool IS and only goes up; the band is how well that one came out and a rework re-rolls it.
  A Masterwork tier 4 and a Rough tier 6 pay nearly the same and want completely different things from
  you — which is why "+4.1%" on its own could not be acted on. The sheet separates them ("the tier is
  worth 3%; it came out Fine, which a rework can still re-roll"), prices the next rung against the bag,
  and offers a door for each. It never crafts: every route ends on a row at the bench, because a second
  Craft button priced separately is two implementations of "can I make this".

---

### ✂️ Tempering — REMOVED
> *"Spending more parts to roll better, remove that."* (2026-10-30, after reading the row cold)

Gone at every layer, not hidden: the control, the surcharge in `temperCost`/`TEMPER_SHARE`, the extra term
in the quality exponent (`TEMPER_BONUS`), the `temper` flag through `groveCraft`/`groveCraftMany`, the
`oddsTempered` column in the payload, and the API's acceptance of it. A flag the UI no longer sends but
the server still honours is an exploit waiting to be found.

⚠️ **THE ACT'S BIAS IS NOT THE SAME THING AND IT STAYS.** `extra` bends the same exponent, but the player
earns it by playing the three minigames and it costs no parts — it is the whole reason the act exists.
⚠️ And "The Temper" is still one of the ten minigames (the spin-stop dial); that name is unrelated.

## Open — the specific bugs

### P. A stray "Open" button overlapping text on the chests — UNVERIFIED
> *"when we had chests, there's this weird overlap issue where like there's this random open button just
> hanging out over text."*

⚠️ **REPORTED IN THE SAME BREATH AS ITEM D AND NEVER WRITTEN DOWN** — claimed as logged in a session
summary and not actually in this file, which is the failure this document exists to prevent.

**DONE** (`28`). A class-name collision, and a textbook one. The bench's chest SHELF owned `.gv-chest` —
a list of rows, each with art, a name and an Open button. The chest that stands on the zone floor was
given the same name in the same stylesheet, later in the file, and won:

```
.gv-chest { position: absolute; bottom: 7%; left: calc(26% + ...); width: 58px; height: 52px; z-index: 250 }
```

So every row of the shelf was ripped out of flow into a 58x52 box at 26%/7%, stacked on top of each other
at z-index 250 — "this random open button just hanging out over text", exactly. Measured on the live page
before the fix: `position: absolute, left: 101.391px, width: 58px, zIndex: 250`. After: `static, auto,
390px, auto`. The floor chest is `.gv-zchest` now; the shelf keeps the name it had first.

⚠️ The report was two weeks old and still live. [[grep-the-class-name-before-taking-it]].


### E. Plinko is squashed into the bottom of the screen
> *"the Plinko screen needs to be like way taller. It's like, it feels like it's been shoved in the bottom
> portion of the screen."*

**DONE** (`19`), and photographed end to end (`25`). The board was a fixed 150px under two stacked headers
— the stage that decides the item's QUALITY was the smallest thing on the page and the ball crossed it in
under a second. It is `clamp(230px, 44vh, 380px)` now, so a short phone still gets a real board and a
desktop does not get an absurd one; the peg rows space themselves and the only thing that changes is how
far the ball falls, which is the drama.

### F. Plinko should drop a ball, not the item
> *"I don't want it to be the item that Plinkos. I want it to just be like a colorful ball or something, but
> like it has to have way more dopamine as it bounces around, and then a massive dopamine burst when it
> splashes at the bottom."*

**DONE** (`19`), and photographed end to end (`25`). The thing falling used to be the recipe's own sprite
— a 32px pickaxe tumbling down a peg board, which reads as the object being dropped and damaged rather
than as a game being played. It is an orb now, with no such baggage and free to be as loud as it likes:
`--n` rises 0→1 as it falls and the hue travels with it, the pegs light where it strikes, and the splash
is 24 shards in the landed band's own colour over three times the old throw.

### G. ⚠️ The bellows timer resets on every tap, so you can tap forever
> *"the bellows, like you can just tap forever, it resets the timer, so you can literally tap to infinity.
> And I think the intention there was for it to be a timed thing… it should be like a countdown, and then
> they're fighting against time to get their taps in, but it should never refresh the timer when they tap,
> because that's the whole point of the tapping minigame."*

**This is a live bug, not a taste note** — the minigame has no fail state.

### H. The bellows starts with no warning
> *"it just pops up with no explanation to the player that they're about to start a tapping minigame and
> then go. So it should be like a countdown."*

A countdown into the round, not a paragraph. See `teach-by-showing-not-telling`.

**DONE** (`24`), and for all ten rather than the bellows alone — landing cold in The Inlay with the clock
already draining is the same complaint, worse, because a craft now deals three unknown games out of ten.
Three beats over the game, already drawn and frozen behind them: that is the whole explanation, and it is
the only kind this pool is allowed. `t` stays at 0 through the lead so nothing is moving yet, and the
overlay itself eats the taps — ten games each remembering to check a flag is nine chances to forget.

### I. No feedback while tapping the bellows
> *"when they're tapping, like there's no feedback. There needs to be visual feedback, like sparks and
> flames flying around and stuff."*

### J. ⚠️ "Craft 10" skips the minigame entirely
> *"when people do craft 10, it just skips the entire minigame, and also they should be able to craft a
> selected amount up to the max quantity of ingredients that they have, but it should always do the
> minigame."*

Two things in one.

**The minigame half is DONE** (`13` above): the batch opens the act, plays it once, and every item is forged
against that performance. Each craft still re-seeds, so ten items roll ten bands — the performance shifts
where the spread sits rather than stamping one landing ten times.

**The quantity half is DONE** (`14` above): a −/+ stepper around the make button, from 2 up to the live
maximum, with the ceiling printed under it. The chosen number is deliberately NOT stored per row on mount —
the max moves whenever a part is spent or picked up, so a stored copy would go stale and start disagreeing
with the bag. Absent reads as "all of them", and any stored number is clamped against the live max on every
render.

### ⚠️ Two real bugs the new console capture found, and the rig change that found them — DONE
`shot.mjs` now reports a page's console errors, uncaught throws and failed loads beside the filename it
writes. It was added because the craft lab photographed perfectly while Next's dev overlay sat in the
corner of the picture reading "2 Issues" — a rig reporting a pass over a page that is saying it is broken.
Both of those turned out to be real, and neither was visible in any screenshot:

- **The Inlay's channel was a hydration mismatch.** `Math.sin` is implementation-defined in its last bits
  and Node's does not agree with Chrome's, so the polyline the server rendered and the polyline the browser
  rendered differed around the 15th decimal — enough for React to refuse to patch the subtree. Rounded to
  two decimals on a 0..100 viewBox, which is finer than a pixel at any size it is ever drawn.
- **The Draw set state on the act while the act was rendering.** It grew the billet inside `setHeld`'s
  updater and called `finish()` from in there when the metal burst — and an updater runs during render.
  The truth lives in a ref now and the state is only the picture of it.

### K. Inventory ↔ crafting has to be traversable, the way Cooking is
> *"there has to be some linkage between your inventory and crafting, kind of like how cooking does it,
> where you can see all the ingredients and bounce between linked ingredients and stuff. We have to create
> some kind of connection to easily traverse between inventory and crafting."*

Cooking is the reference implementation — go and read it before inventing anything.

**DONE** (`26`). Cooking's move is a recipe row whose missing ingredient jumps to the recipe that MAKES it,
with a breadcrumb back. The Grove cannot copy that move, because a Grove part is not made by anything — it
is cut off a creature. So the jump has two destinations instead of one, and a part now has a sheet that is
both: **backwards** to which creatures carry it and which zones they live in, and **forwards** to every
recipe that wants it, each one a door that lands you on that row at the bench.

It opens from the BAG, which is the half of the loop that had no answer: the bench is a list of recipes, so
"what does this recipe need" was always free, and standing over twenty kinds of bone with nothing saying
which were worth keeping is the direction a player is actually facing. The bag cells were inert spans —
correctly, since tap-to-bank died with the bank — and are buttons again because there is finally something
behind them.

Two things it needed on the way: recipe rows had no DOM `id` (a React key is not in the document, so
nothing could scroll to one — the same defect `GroveArea` had), and the bench now drops its chip filter
when a jump names a row, because Cooking learned that one too: "a jump that lands on nothing is worse".

### L. Crafting has to show what you already own
> *"we also need to be able to have some linkage between crafting and items you've already crafted to see
> like what you currently possess and whether it's worth crafting that item again, what kind of quality you
> have on the existing item."*

A recipe row should answer: do I have this already, at what quality, and is a second one worth the parts.

**DONE** (`26`). A TOOL row already answered it — it carries the band of the tool in that slot and prices a
Rework against it. Foods and charms answered nothing, and a charm is where the question bites hardest:
charms are banded, you can hold several, and the only reason to craft a second is to beat the band you have.
The row now carries what you hold and, where the kind is banded, the best band of it — "Moss Poultice ×35",
"Rootwood Seeking ×3 Fine".

⚠️ COUNT AND BEST BAND, NOT A LIST. The Charms shelf is one row per potency on purpose, because a Rough
and a Masterwork are different objects and picking between them is the decision. That is right for a shelf
you pick FROM and wrong for a recipe, where the only question is whether another would beat what you have.

### M. The craft-ready note sat in the middle of the fight — DONE
> *"When you can craft a new item, the notification that pops up is directly in the play area. It should
> instead be… on the left side near the whole crafting panel. That would make a lot more sense."*

Was `left: 50%`, centred over the floor you are fighting on. Now anchored to the left edge above the dock —
the same edge as the menu handle the workbench lives behind, so the message and its answer are together.
Bottom-left rather than beside the handle because the haul list already owns that edge from 42% down.

### N. Audit the pets for ones that can no longer be obtained
> *"there's certain pets that are casino exclusive, or maybe were, that are maybe no longer attainable. Can
> you do an audit later on all the pets we have, and if there are some of them are just not achievable
> anymore?"*

**Explicitly "for later."** Walk every pet against every live source — casino prize tables, chests, drops,
shop, events — and list the ones with no reachable path. Same shape as the Grove drop-path audit:
`migrating-a-category-strands-its-drop-paths` is the precedent, where an empty pool read as bad luck.

### O. Hero sprites need iconic personalities
> *"hero sprites need iconic personalities"*

**Queued as a todo, not started.**

**Where it stands, so the next session does not have to find it:** the hero sprite is generated per player in
`src/lib/marketplace/avatar-sprite.js`, by redrawing their cartoon avatar as a full-body figure. Read the
prompt and the gap is obvious — every word of it is about *fidelity and framing*: keep the same face, skin
tone, hairstyle, eyewear and clothing; fit the whole figure inside with 8% margins; face right.

The only word about attitude is **"a confident heroic standing pose"**, and it is the same word for
everybody. So the sprites are accurate and interchangeable — which is exactly the complaint.

**The open design question** is where a personality should come from, and it should be answered before any
art is drawn: the player's **class** (a Reaver and a Warden should not stand the same way), their **gear**,
or something they **choose**. Pose, silhouette, weapon carry and expression are the levers; the face and
colours must stay faithful or it stops being their avatar.

⚠️ Anything here is a **regeneration of art every player already has**, so it collides with
`redrawing-existing-art-needs-high` — draw ONE, show Luke the before/after, and let him decide before a set.

---

## ✂️ Q. MONSTER PARTS AND CRAFTING ARE REMOVED — 2026-11-08

> Luke: *"I dont want the loot noise in the grove"* → *"I think we remove monster part items, remove crafting
> all together"* → and on where tools come from afterwards: *"I think we backlog a way to get tools later."*

This supersedes items **C**, **D**, **G**, **H**, **I**, **J**, **K** and **L** below — every one of them is
feedback about a bench that no longer exists. They stay on the page because a struck item is the proof it was
heard, and because two of them record lessons that outlived their subject (the tier-vs-band note in `D`, and
`K`'s "a jump that lands on nothing is worse").

**It started as a complaint about noise.** Every pickup fired three things at once — a floating label with the
item's art over whoever collected it, a row down the left edge at 42% with a bump animation on the count, and
a two-note chirp. The answer was not to quiet them. Parts were the only thing dropping in that volume, and
they were dropping in that volume because a bench needed twelve of everything.

### What goes

- **Monster parts**, at the source: creatures stop dropping them, so the haul list, the pops and the chirp all
  go quiet on their own. The gear drops stay loud, which is the point — the thing worth announcing announces.
- **The bench**, entirely: recipes, the craft act, the batch stepper, the part sheet, the recipe sheet.
- **Charms and foods** lose their source along with the tools, because the bench was the only thing that made
  any of the three.

### ⚠️ What deliberately STAYS, and why

**The tool plumbing is untouched.** `mkt_grove_tool` keeps its rows and `groveToolPct` keeps answering, because
it is read by **twelve systems** — arena, boss, cooking, crafting, delves, delve-floors, farm-crops, fishing,
mining, sailing, pet-level and acts. Deleting it would have silently returned `+0%` in all twelve, which is the
Grove's entire answer to "why does this matter to my account". Anyone holding a tool today keeps exactly the
bonus they have.

So the hole is **acquisition only**, and that is the backlog item:

> ### R. A way to get Grove tools — ✅ ANSWERED SAME DAY, see item V (the kill bar)
> Tools are strictly unobtainable until this is answered. Three shapes were on the table when it was parked:
> they **drop** off creatures and bosses like gear does, a town vendor **sells** the next rung for gold (the
> Grove becomes a gold sink rather than a parts sink), or they are a **quest** payout. Same open question for
> **charms and foods**, which are now also sourceless.
>
> ⚠️ Until it lands, a new player can never hold a tool, so `groveToolPct` reads `+0%` for everyone who has
> not already got one. That is a known, accepted gap — not a bug to be fixed by quietly re-adding a bench.
> ⚠️ And it collides with `migrating-a-category-strands-its-drop-paths`: an unobtainable thing that is still
> *described* on a screen reads to a player as bad luck, not as absent.
>
> ⚠️ **AND IT IS NOT JUST TOOLS.** The bench was the only source of six kinds, found by counting `R()` across
> `grove-recipes.js` — 209 recipes in all:
>
> | kind | how many | what is stranded |
> |---|---|---|
> | `tool` | 144 (12 slots × 12 tiers) | the twelve systems above |
> | `food` | ~48, one set per map | the combat belt has nothing to put on it |
> | `charm` | 12, one per map, each taught by that map's last boss | `taughtBy` was the one earned row on the bench |
> | `plot` | 2 | **the bench is a FARM PLOT source** |
> | `decor` | 3 | see below |
> | `pack` | 0 live | kind survives in `CRAFT_XP_KIND` only; the bank died earlier |
>
> ⚠️ **The three farm decorations are the nastiest of these.** Carved Stump, Mothlight Lantern and Barrow
> Cairn are `source: "grove"`, `price: null`, epic, and each carries a real farm stat (+3 seedLuck,
> harvestLuck, growSpeed). `source: "grove"` was deliberately chosen so that every hand-out path in the game
> — the wheel, the glint, the level track, both shops — filters them out, leaving `groveCraft` as the only
> door. Remove it and they are three epic decorations that still appear in a 129-row catalogue and can never
> be obtained by anybody. That is `migrating-a-category-strands-its-drop-paths` exactly: an empty path reads
> to a player as bad luck, not as absent.
>
> ✅ **What makes backlogging all of this SAFE, and it was checked before a line was cut:** nothing gates
> Grove depth on a tool tier. The only tier requirement in `grove.js` is "every tier requires the previous
> to craft", which lived entirely inside the bench. With the bench gone the Grove is still completable to
> map twelve by anyone holding no tool at all.

### What the Grove's loop is now

Kill → gear → deeper. `grove-loot.js` was always independent of the bench: one row per (zone, creature), each
with a normal, a rare and a super-rare piece, running common → mythic. The ladder that made the Grove worth
playing never went through crafting.

### Knock-ons to handle in the same pass

- **Quest verbs.** Two step kinds are `harvest` (collect N of a part) and `forge` (craft N) — `grove-quests.js`
  line 167 — and quest rewards pay parts. Both die; the chains need their remaining verbs to carry them.
- **Maps 8–12.** `docs/grove-maps-8-12-design.html` is twelve materials per map plus 36 redrawn tool rungs.
  Most of that spec evaporates, which SAVES art money rather than costing it. Re-price before drawing anything.

---

## ✂️ S. ALL QUEST GIVERS AND QUESTS ARE REMOVED — 2026-11-08

> Luke, asked how to handle the 29 quest steps that lost their verb when crafting went: *"Remove all quest
> givers and quests."*

The question was narrow — 29 of 94 steps across 17 of 28 chains were `harvest` or `forge`, six chains would
have *ended* on a deleted step (and the last step is what carries the chest and the Coliseum token), and one
NPC, `dune` (`harvest, harvest, forge`), would have been emptied completely. The answer was wider.

### What went

| | |
|---|---|
| `grove-quests.js` | progress, accept, claim, the board — 483 lines |
| `grove-npcs.js` | 28 chains, 94 steps, 21 givers and their dialogue — 361 lines |
| `grove-quest-text.js` | the template filler — 51 lines |
| `GroveQuests.js` · `GroveGiver.js` · `GroveQuestLab.js` | the panel, the dialogue, the owner bench |
| `/api/marketplace/grove/quests` | the whole route |
| 4 scripts | `gen-grove-npcs`, `grove-npc-audit`, `grove-quest-audit`, `grove-quest-chests` |

`mkt_grove_quest` keeps its rows — same rule as every other column here.

### ⚠️ What this nearly broke, and what caught each one

- **The Coliseum's only door.** The marshal's card sat in the page between the giver's dialogue and the sheets,
  so the cut that removed the giver took the marshal with it. `lint:undef` caught it as "takeColiseumKey is
  declared and never referenced — a handler nothing calls is a feature nobody can reach". **That gate paid for
  itself twice today.**
- **The daily key's endpoint.** `claimDailyKey` was served by the *quests* route, because a finished chain was
  the other faucet. Deleting that route would have left the Coliseum unenterable while every screen still
  offered a key. It lives on `useColiseum.takeKey` and the coliseum route's `daily` action now.
- **`centralDay`.** Declared at the top of `grove-quests.js`, above the cut that lifted the Coliseum's
  functions out, so it did not travel with them. `lint:undef` again.
- ✅ **The Coliseum survives on the daily key alone**, which was checked BEFORE the chains were cut. Without
  it, removing quests would have made the whole building unreachable.

### ⚠️ And the marshal is the last person in the Grove

`COLISEUM_NPCS` and `COLISEUM_ZONE` moved to `grove-coliseum-plan.js` rather than dying with `grove-npcs.js`.
He was authored alongside the chain NPCs and shares their shape, but he is not a quest giver — he is the door
to the Coliseum, and his line is the only dialogue left in the forest.

---

## ⚠️ T. THE COLISEUM CHEST HAS NEVER GRANTED GEAR — FOUND 2026-11-08, FIXED

Not feedback. Found by the build breaking: `grove-coliseum-loot.js` imported `storeParts`.

A chest was *"a bunch of parts, definitely some gear"* — `{ parts: 3, each: [2,4], gear: 0.35 }` up to
`{ parts: 6, each: [6,14], gear: 1 }`. The parts were real. **The gear was this:**

```js
gear: rng() < tier.gear ? { tier: row.tier } : null,
```

A marker. No `grantItem`, nowhere. So "definitely some gear" on the top two tiers handed over **nothing**, for
the whole life of the Coliseum, and nobody noticed because the part stacks beside it were real.
[[declared-but-never-read]]. Removing parts is what exposed it — the chest went from paying half of what it
claimed to paying literally nothing.

**Fixed:** the chest grants real gear through `grantItem(..., "grove_coliseum")`, the same function every other
source uses, from a pool built out of `GROVE_GEAR` so a chest can never hand over a piece the forest itself
would not drop. It takes the **super-rare** slot, because a run is a key, two minutes and twelve waves, and
paying the `normal` piece a rootrat coughs up would make the building pointless.

⚠️ **The per-tier `gear` CHANCE was not carried over as a chance, and that is a judgement call to check.**
With parts gone it was the only thing in the box, and mossbound at 0.35 would have opened empty on two chests
in three. Every tier now pays at least one piece and the tier decides how many — 1 / 1 / 2 / 3. If you want a
chest that can disappoint, that is the line to change.

### ⚠️ AND THE OPENING RESULT IS STILL SHOWN NOWHERE — NOT FIXED

`useColiseum` puts the result into `result` via `setResult({ opened: j })`, and **nothing reads `col.result`
anywhere in `GroveClient`** — grepped, zero call sites. So a member opens a chest and is told nothing at all
about what was in it. That is the reason the dead gear went unnoticed for so long: there was no screen on
which its absence could show.

Deliberately not fixed in this pass. A result screen is a thing to **build**, not a line to change, and it
wants Luke's eye — it is the same shape as the boss kill card, which already exists and is the obvious model.

---

## ⚠️ U. DEAD CSS, STATED SO NOBODY THINKS IT WAS MISSED

109 of the 283 `.gv-*` classes in `grove-css.js` now have no renderer. **Much of that predates today** — the
merits shelf, `gv-bench2`, the old area meters were already dead before this cut.

Left alone on purpose: a selector that matches nothing cannot collide with anything, and picking 109 rules out
of 4,800 lines by hand is its own job with its own chance of taking a live one with it. The detector is four
lines of `re.findall` over the stylesheet against every remaining JS file if somebody wants to do it properly.

⚠️ The thing to actually watch for is the OTHER failure, and it is written down: `.gv-chest` was owned by two
different components and the later one won, which is how "a random open button just hanging out over text"
happened (item P). That is a NAME COLLISION, not a dead rule. Nothing was renamed in this pass, so no new
collisions were introduced — but [[grep-the-class-name-before-taking-it]] before reusing any of these.

---

## ✅ V. ITEM R IS ANSWERED — THE KILL BAR, BUILT 2026-11-08

> Luke: *"You kill enemies in an area. A bar fills. It reaches full. You get a reward. The reward is a
> crafting tool. The bar resets, you repeat. The reward is each crafting tool of that zone tier. Once you have
> all tools. It becomes a low level chest, with a chance to roll higher. For zones 1 and 2 then high tier chest
> would be iron. 3 and 4 gold, etc"*

**Item R above is closed by this.** Tools have a source again, so the gap that opened when the bench was
deleted is shut — charms and foods are still open, see the bottom of this item.

`migrations/510-grove-bar.sql` · `src/lib/marketplace/grove-bar.js` · `scripts/check-grove-bar.mjs`

### How it works

**250 kills per fill** — Luke's number, asked directly. The bar belongs to the **map**, not the zone, because
a tool's tier *is* its map ("that zone tier") and walking through a gate between two zones of one map must not
reset your progress. It ticks on **settle**, off the clamped kill count, never the count the client claimed.

- **While the map owes tools:** the next slot in `TOOL_SLOTS` order, granted at that map's tier with a rolled
  quality band. Twelve slots, so twelve fills kits out a tier.
- **Once all twelve are held:** a chest, promoted up from wooden while the roll keeps succeeding.

⚠️ **"Missing" means `tier < map`, not "no tool".** A rod at tier V is better than anything map three can
hand over, so an early map owes nothing for that slot. Without that rule, walking back to map one would offer
to **downgrade every tool you own**.

### ⚠️ The ceiling stops at mythic, and that reverses the obvious reading

`etc` across twelve maps lands on **celestial** — `CHEST_ORDER` is wooden, iron, gold, mythic, ascendant,
eternal, celestial, primordial, so the pairing fits twelve maps exactly. Asked where it should stop, Luke's
call was **mythic**, because every tier above it is `source: "elite"` — real money. That is the same decision
he made when the Grove's own chests were removed (*"drop the top tiers rather than pay them another way"*), and
an ascendant chest pays its own tier or better **50%** of the time, so maps 7–8 would have quietly become a
grind route to paid gear. **Map 7 is built and live**, so this was not hypothetical.

| maps | ceiling | what it actually pays |
|---|---|---|
| 1–2 | iron | wooden 75%, iron 25% |
| 3–4 | gold | wooden 71%, gold 8.5% |
| 5–6 | mythic | wooden 65%, mythic 4.4% |
| 7–12 | mythic | wooden 53% at map 12, mythic 10.3% |

**Depth buys odds, since it no longer buys a ceiling.** Maps 5–12 share a top, so the promotion chance climbs
with the map — 25% at map 1 to 47% at map 12. Mythic goes from 3.6% of chests at map 5 to 10.4% at map 12, so
eight maps of progression still mean something at the one reward they all share.

### ⚠️ THE FAUCET, STATED OUT LOUD

**`BAR_KILLS` is a mint rate, not a difficulty dial.** Tools are finite; every fill after the twelfth is a
chest, for ever. At the Grove's own 40 kills/min cap:

- a fill is a **6.3 minute** floor
- a full twelve-tool set is **~75 minutes** of farming
- after that it is **9.6 chests/hour, per member, permanently**

Halving the constant doubles the Den's chest income from the Grove. `check:grove-bar` prints those three
numbers on every run so nobody has to rediscover them, and it fails if a fill ever drops under five minutes.
[[economy-nerf-measure-daily-total]] — measure over three days before touching it.

### Verified

- `check:grove-bar` — twelve tools then chests, each slot exactly once, no map can ever pay an elite chest
  (that last one is the assertion that stops somebody "finishing" the pairing later), the floor stays the
  common case, and depth still beats shallow.
- The **SQL** tested directly against the database, because the gate cannot: the increment is atomic, the
  remainder **carries** (300 kills pays once and leaves 50 on the clock), and `BAR_MAX_FILLS` **defers** rather
  than destroys — 2,600 kills at once pays eight and leaves 600 sitting on a 250 bar, which the next kill pays
  out. The display clamps that so it never reads "600/250".
- Migration applied and the table's columns read back.

### ⚠️ Still open after this

- **Charms and foods have no source.** The bar pays tools and chests only. Charms are the sharper gap: they are
  banded, you hold several, and a map's last boss used to teach the recipe — that teaching was removed with
  the bench, so the Charms shelf now says "None yet, and no way to get one at the moment."
- **2 farm plots and 3 epic farm decorations** (`source: "grove"`, `price: null`) are still unobtainable.
- The bar is only drawn **in a zone**. The hub shows nothing about it, so a player choosing where to farm
  cannot see which map's bar is nearly full. Not a gap in the feature as described — "you kill enemies in an
  area" — but it is the obvious next place for it.

---

## Rules these all sit under

- **No tutorials, no one-time guides, no text blobs.** Teach with state that moves. `teach-by-showing-not-telling`
- **No icons, glyphs or emoji** — every destination gets a generated sprite. `no-icons-or-glyphs-in-the-game`
- **No announcements for casino changes, ever.** `never-announce-casino-changes`
- **Three images per generation run, priced out loud, never at `high`.**
- **A badge that cannot be cleared teaches players to ignore every badge.** Luke: *"you can like never get
  rid of the bubbles."*
