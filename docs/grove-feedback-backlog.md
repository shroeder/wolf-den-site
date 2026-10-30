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

**⚠️ The rest is still open and it is the bigger half.** He wants Town rendered *as another Grove zone, with
the Grove's menu down the left* — "still in that experience". `TownClient` is a full-screen social overworld
with its own camera, polling and state, so mounting it inside the Grove shell is real work and wants its own
pass. A door stops the bleeding; it is not the ask.

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

**DONE** (`20`, `21`). Ten games with ten distinct verbs, drawn three at a time without replacement, wired
into the real `GroveCraftAct` — the hardcoded bellows and anvil are two of the ten now. Each game reports one
number 0..1 and the act weights three; the economy's range is provably unchanged. Bench at
`/marketplace/grove/minilab`, owner-only.

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
- **inspectable tools** — PART DONE (`17`). The quality band is now printed on the tool, which was the
  biggest miss: `toolMeta` has carried `quality` since it was written and no screen showed it, so the one
  thing the crafting minigame exists to decide was invisible on the thing it decided. A fuller inspect —
  which map forged it, reworks used, what the next rung costs — is still open.

---

## Open — the specific bugs

### E. Plinko is squashed into the bottom of the screen
> *"the Plinko screen needs to be like way taller. It's like, it feels like it's been shoved in the bottom
> portion of the screen."*

### F. Plinko should drop a ball, not the item
> *"I don't want it to be the item that Plinkos. I want it to just be like a colorful ball or something, but
> like it has to have way more dopamine as it bounces around, and then a massive dopamine burst when it
> splashes at the bottom."*

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

### L. Crafting has to show what you already own
> *"we also need to be able to have some linkage between crafting and items you've already crafted to see
> like what you currently possess and whether it's worth crafting that item again, what kind of quality you
> have on the existing item."*

A recipe row should answer: do I have this already, at what quality, and is a second one worth the parts.

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

## Rules these all sit under

- **No tutorials, no one-time guides, no text blobs.** Teach with state that moves. `teach-by-showing-not-telling`
- **No icons, glyphs or emoji** — every destination gets a generated sprite. `no-icons-or-glyphs-in-the-game`
- **No announcements for casino changes, ever.** `never-announce-casino-changes`
- **Three images per generation run, priced out loud, never at `high`.**
- **A badge that cannot be cleared teaches players to ignore every badge.** Luke: *"you can like never get
  rid of the bubbles."*
