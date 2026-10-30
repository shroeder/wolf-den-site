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
| 12 | Plinko: a colourful ball falls, not the item, and the splash is 24 shards (item F) | `(this)` |

---

## Open — the big ones

### A. Town should not evict you from the Grove
> *"if you go to town, you completely get booted out of the Grove. Like, the whole experience is lost. You
> have to go all the way back into the menu to find the Grove again… When you go to a town, it shouldn't be
> like that. You should still be a part of the Grove… when you're in the town, it should be like you're in
> any other zone of the Grove with the menu on the left and still in that experience, at least when it goes
> ungated."*

**Where it stands:** `GroveClient` does `window.location.href = "/marketplace/town"` — a hard navigation
into a separate client with no Grove shell. Death does the same (`router.push("/marketplace/town")`). The
session is genuinely destroyed, not hidden. **Structural: decide whether Town mounts inside the Grove shell
or the shell wraps Town.**

### B. The class tree must be playable from inside the Grove
> *"we need to make it super clear, like the whole class tree and everything, that all that needs to also
> live in a menu in the Grove, because people don't understand what the abilities are doing and what their
> class selection and their point class points are doing when it comes to the Grove. And it shouldn't just
> explain it in a text blob. It should be very dopamine inducing, and like, you should be able to make class
> selections and tree decisions from that same area in the Grove."*

**Where it stands:** the room exists (`panel === "class"`) and is **read-only** — it shows what the tree
gives the Grove fighter and nothing else. Selections and point spending still live elsewhere.

### C. Crafting minigames: a pool of ten, three at random
> *"The crafting minigame sucks. I think that it should, instead of being deterministic, it should be
> random. It should pull from, like, let's say 10 different kind of mini games, and I expect you to make all
> the mini games up, and they all have to look amazing and beautiful, and you have to be proud of it, and
> they all have to be super clear. So it'll pull from a pool of 10 mini games randomly, and it'll pull three
> of them, and there's clearly three phases."*

Ten minigames, invented here, each beautiful and self-explanatory. A craft draws **three at random** and the
three phases must read as three phases.

### D. A full usability pass on the inventory
> *"when you're looking at your inventory, you can't collapse things… when you craft something, we need a
> modal that pops up telling you exactly what you crafted and why it matters and what the stats are. And
> then we also need the ability to go see where to go look at the item, because people have no idea where to
> go after they craft it. Like, it's just completely like disappeared. And you can't even like inspect the
> tools in your tools area. I feel like when you're in the inventory, like we just need to do a lot better
> job letting people inspect things… You need to do a full pass on that."*

Four named pieces: **collapsible sections**, a **craft-result modal** (what it is, why it matters, its
stats), a **take me to it** route from that modal, and **inspectable tools**.

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

### I. No feedback while tapping the bellows
> *"when they're tapping, like there's no feedback. There needs to be visual feedback, like sparks and
> flames flying around and stuff."*

### J. ⚠️ "Craft 10" skips the minigame entirely
> *"when people do craft 10, it just skips the entire minigame, and also they should be able to craft a
> selected amount up to the max quantity of ingredients that they have, but it should always do the
> minigame."*

Two things in one: the batch path (`craftAll` in `GroveBench`) bypasses `GroveCraftAct` altogether, and the
batch size is a fixed button rather than **a chosen amount up to what the ingredients allow**. The minigame
must run either way.

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

---

## Rules these all sit under

- **No tutorials, no one-time guides, no text blobs.** Teach with state that moves. `teach-by-showing-not-telling`
- **No icons, glyphs or emoji** — every destination gets a generated sprite. `no-icons-or-glyphs-in-the-game`
- **No announcements for casino changes, ever.** `never-announce-casino-changes`
- **Three images per generation run, priced out loud, never at `high`.**
- **A badge that cannot be cleared teaches players to ignore every badge.** Luke: *"you can like never get
  rid of the bubbles."*
