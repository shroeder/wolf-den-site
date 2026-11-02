// ── WHAT THE TWENTY-ONE OF THEM SAY, STEP BY STEP ────────────────────────────────────────────────────────────
// Luke: "I was hoping for like dialogue where they tell you about the problem they're having and then the
// solution, and then you get the quest and there's like a big thing in the middle saying like quest received."
//
// grove-npcs.js already had the hard part: three givers to a map, authored unpredictable zones, 71 steps
// across 21 chains, seven different kinds of ask, targets resolved from each map's own creatures and parts.
// What it had was ONE line per person — `npc.line` — shown identically whether you were on step one or
// step five, with the ask rendered underneath as "Defeat 37 · urchin_roller · zone 44". A person who says
// the same sentence for an hour is a vending machine with a face.
//
// So every step gets the same four beats the town givers got:
//
//   problem   why they are asking, this time. Said before you take it.
//   ask       the job in one line, naming the real thing.
//   nudge     if you come back without it.
//   done      the payoff. Second beat is the one that moves the chain on, because a chain is a relationship
//             and the end of each step is where it changes.
//
// ⚠️ THE TARGETS ARE RESOLVED, NOT WRITTEN. questsFor() picks each step's creature, part, zone or wave from
// that map's own catalogue, and those picks can change when a map is retuned. So the lines carry
// placeholders — {n} {foe} {part} {n_zone} {wave} — and fill() puts the real nouns in. A line that hardcoded
// "twelve Mothlight" would be a lie the first time anybody rebalanced map one.
//
// ⚠️ AND THE VOICE IS THE ONE THEY ALREADY HAD. Each person's `line` and `role` in grove-npcs.js set their
// register before any of this existed; these continue it. The Snarefitter is lazy and delegates, The Blind
// Cartographer gives orders, Assayer Dune is dry, The Gilt-Hunter is wrong and cheerful about it.

/** Said when you walk up and they have the next step waiting. Falls back to their own `line`. */
export const GREET = {
    alder: "Still in one piece. Good — there's something I can't get to.",
    pell: "Oh — you. Mind your feet. Now, while you're here.",
    snare: "Perfect. Somebody with legs.",
    mub: "You've got the look of somebody who'll go where I point.",
    cart: "Stop there. I can hear you fine from there.",
    odd: "You came back! Most don't. Right —",
    sil: "You. Hold this a moment. No — actually, better idea.",
    priest: "The water said you'd come up this way.",
    nim: "Don't come up here, the stilts won't take two. Listen from there.",
    coble: "Right, you'll do. Tide's left me a problem.",
    keeper: "You're on the correct side of the line. Keep it that way.",
    oss: "Hands busy, mouth free. Sit down a minute.",
    mason: "Careful under that arch. Now — you can lift, can't you.",
    quell: "You're dry. That's temporary.",
    vane: "Don't touch the tablets. Do come here.",
    dune: "Let me guess. You've found gold.",
    gilt: "You're just in time. I've nearly got it.",
    kel: "Hold the stake. No — forget the stake. Listen.",
    rook: "Warden. It hasn't moved. That's not the same as safe.",
    counter: "Eleven thousand, four hundred and — hm. You've interrupted me. Good.",
    sol: "Mind the coals. Everything on this floor is still hot.",
};

/** Said when a chain is finished and they have nothing left. */
export const SPENT = {
    alder: "Nothing left on my list. The treeline's yours as much as mine now.",
    pell: "That's my basket full and then some. Go and tread carefully somewhere else.",
    snare: "All forty lines, checked, by somebody who isn't me. Perfect arrangement.",
    mub: "The glow's holding. First time in a season. Go on, take a cutting.",
    cart: "I have the whole map in my head now, and you walked all of it. We're square.",
    odd: "We went further than sensible and came back. Twice. Nothing left to prove down here.",
    sil: "Reeds are cut, and they've stopped cutting back. I'll take that as finished.",
    priest: "It has what it wanted. So have you. Go up.",
    nim: "You've done it all with wet feet, which I'll never understand. Well done anyway.",
    coble: "Tideline's sorted, the nets are whole and the sea's kept nothing worth having. Done.",
    keeper: "The line holds and it holds further out than it did. That's your doing. Dismissed.",
    oss: "Every net I own is whole. I've nothing to mend and nothing to ask. Odd feeling.",
    mason: "It's standing. It'll outlast me now, which was always the whole point.",
    quell: "Bottom's been seen and you came back up each time. That's the entire profession.",
    vane: "The record is complete and copied. Whatever happened here, somebody will know. Thank you.",
    dune: "You brought me actual gold. Once. I'll be telling people about it.",
    gilt: "I was right. I was RIGHT. Go on — nothing more from me, I'm busy being right.",
    kel: "Ten times raised, and this one's still up. Go and look at it on your way out.",
    rook: "The fire's where it was when you arrived. That is the whole job, and you did it.",
    counter: "The number's stopped going up. I've recounted twice. Nothing more to count.",
    sol: "Everything worth saving is worked, and you worked most of it. The forge is yours whenever.",
};

/** Their send-off, under the QUEST RECEIVED plate. */
export const SENDOFF = {
    alder: "Go steady. Come back along the same path.",
    pell: "Mind your feet on the way.",
    snare: "Lovely. I'll be here.",
    mub: "Take a lamp. Take two.",
    cart: "Go. And be loud about it.",
    odd: "Ha! Right behind you. Eventually.",
    sil: "Don't blunt it.",
    priest: "Go under, if it asks.",
    nim: "Try not to sink.",
    coble: "Tide turns in an hour. So should you.",
    keeper: "Noted. The line is where I said it was.",
    oss: "Gently, now. Things tear.",
    mason: "Lift with your legs.",
    quell: "Breathe out on the way down.",
    vane: "Copy nothing. Carry it back whole.",
    dune: "I'll have the scales ready. I won't need them.",
    gilt: "This is the one. I can feel it.",
    kel: "If it falls again, don't tell me until you're back.",
    rook: "At the double.",
    counter: "I'll keep counting. You go and change the number.",
    sol: "Hot side away from you.",
};

// ── THE SEVENTY-ONE STEPS ────────────────────────────────────────────────────────────────────────────────────
// Keyed by step id, which questsFor() builds as `<npc>_<1-based index>`.
export const STEPS = {
    // ═══ MAP 1 · THE GROVE ═══════════════════════════════════════════════════════════════════════════
    // Warden Alder — keeper of the treeline. Weary, dry, has watched this edge a long time.
    alder_1: {
        problem: ["The treeline's where the Grove decides what it lets out.", "Lately it isn't deciding. The {foe} are coming through in numbers I can't stand in front of."],
        ask: "Put down {n} of the {foe}, along the edge where they cross.",
        nudge: "Still coming through. I can hear them from here.",
        done: ["{n}. The edge is quiet for the first time this week.", "Now — while they're down, there's something I want off them."],
    },
    alder_2: {
        problem: ["Things die out there and something grows on them after. Always has.", "It's {part}, and it's the only thing in this forest that's reliable."],
        ask: "Bring me {n} {part} from whatever's lying out past the treeline.",
        nudge: "Nothing in your hands yet.",
        done: ["{n}. That'll keep the lamps lit a month.", "You've been to the edge and back twice now. Time you saw what's behind it."],
    },
    alder_3: {
        problem: ["I've told you what's out there. You've taken my word for it twice.", "That's twice too many. A warden who only knows the edge isn't a warden."],
        ask: "Walk it yourself. Get as far as the {n_zone}th room and look at it.",
        nudge: "You've not got there yet. It doesn't bite until the fourth.",
        done: ["You went. Good. Now you've seen why I stand where I stand.", "That's everything I had. Go deeper than I ever did."],
    },

    // Mossgatherer Pell — collects what grows on the dead. Soft, odd, fond of small things.
    pell_1: {
        problem: ["I'd go myself but I'm slow and it's all a bit far.", "The {part} comes up thick where the ground stays wet."],
        ask: "Fill a basket for me — {n} {part} will do it.",
        nudge: "Basket's still light, love.",
        done: ["Oh, that's lovely. Look at the colour on that.", "Now. There's a reason I don't go out there myself."],
    },
    pell_2: {
        problem: ["The {foe}. They don't look like much and they aren't, individually.", "It's that they've worked out I come back to the same patches."],
        ask: "Deal with {n} of the {foe} so I can gather in peace.",
        nudge: "They're still out there being clever about it.",
        done: ["Quiet out there now. I can hear the moss.", "That's all I'll ask of you. Come back and I'll give you something odd."],
    },

    // The Snarefitter — sets traps she never checks. Lazy, funny, cheerfully delegating.
    snare_1: {
        problem: ["Forty lines. I set every one of them myself, which was the hard part.", "Checking them is the boring part, and I've never once done it."],
        ask: "Walk my lines and finish what's in them — {n} {foe} should cover it.",
        nudge: "Lines still full. Mine, that is. Your hands look empty.",
        done: ["{n}! Forty lines and most of them earning. I knew the design was sound.", "Now. Something's been taking what my lines catch."],
    },
    snare_2: {
        problem: ["Something bigger has been going along my lines ahead of me.", "Eating what I caught and leaving the wire. Rude."],
        ask: "Find the {foe} and settle it.",
        nudge: "Still eating my catch, I expect.",
        done: ["That's the thief. You can see it's been living well off me.", "Right — clearly my wire isn't up to this place."],
    },
    snare_3: {
        problem: ["My snares were built for things with manners. Clearly that's over.", "I want one that holds something that argues."],
        ask: "Take {part} to the bench and build me a better snare.",
        nudge: "Bench is that way. I'd show you but, you know.",
        done: ["Now THAT will hold. Look at the tension on it.", "One more thing, and this one you'll hate."],
    },
    snare_4: {
        problem: ["Here's what I've never done, in eleven years of setting lines.", "Stayed out with them overnight. Not once. I'd like to know what it's like."],
        ask: "Sit the night out in the {n_zone}th room and clear it without leaving.",
        nudge: "You've come back. That's not sitting it out, is it.",
        done: ["You stayed. You actually stayed.", "I'm not going to do that. But I'm very glad somebody has. That's my lot — go on."],
    },

    // ═══ MAP 2 · THE UNDERCAVE ═══════════════════════════════════════════════════════════════════════
    // Lampwright Mub — farms the glow. Earnest, agricultural about light.
    mub_1: {
        problem: ["Up top you get light for free. Down here it's a crop and I'm the farmer.", "My beds are thinning. I need cuttings from the wild {part} to replant."],
        ask: "Bring me {n} {part} from the deeper galleries.",
        nudge: "Beds are still bare.",
        done: ["Good stock, that. Thick stems.", "Replanting won't help if the thing eating them is still down there."],
    },
    mub_2: {
        problem: ["Something's grazing my beds at the edges. Neat work, which is worse.", "It's the {foe}. They've learnt where the good rows are."],
        ask: "Clear {n} of the {foe} out of the growing galleries.",
        nudge: "Still being grazed.",
        done: ["{n}. The rows will come back now.", "Last thing, and it's for you more than me."],
    },
    mub_3: {
        problem: ["You keep going down with borrowed light. That ends badly.", "A lamp that goes out down here isn't an inconvenience, it's the end of the story."],
        ask: "Take {part} to the bench and build yourself a lamp that holds.",
        nudge: "Still carrying somebody else's light, I see.",
        done: ["That'll burn when you need it to. Not a crop — a tool.", "Go further than I ever have. That's everything I had."],
    },

    // The Blind Cartographer — maps by sound. Precise, commanding, impatient with description.
    cart_1: {
        problem: ["I don't want to know what it looks like. Everyone tells me what it looks like.", "I want to know how big it is, and for that I need a sound made in it."],
        ask: "Go to the {n_zone}th chamber and make noise. Properly. I'll be listening.",
        nudge: "I've heard nothing from the fourth. You're not there.",
        done: ["Twelve-second return. It's a long room, and it narrows.", "Now the part where my ears aren't enough."],
    },
    cart_2: {
        problem: ["I can hear the {foe} but I cannot count them. They move while I listen.", "The only honest count is one taken by hand."],
        ask: "Thin the {foe} until you've done {n}, and keep count.",
        nudge: "Still too many voices.",
        done: ["{n}. That matches my worst estimate, which is reassuring and horrible.", "Deeper, now. There's a chamber I've never got a return from."],
    },
    cart_3: {
        problem: ["The ninth is a hole in my map. Every sound I send in dies in it.", "Either it is enormous or it is full of something soft."],
        ask: "Reach the {n_zone}th chamber and make the same noise there.",
        nudge: "Nothing back from the ninth yet.",
        done: ["No return at all. Nothing. I don't like that and I'm glad to know it.", "One more. And this one is not for the map."],
    },
    cart_4: {
        problem: ["There is a room down here built to be shouted in. They fight in it.", "I have listened to it from outside for years and it is the loudest thing in the Undercave."],
        ask: "Go in and reach wave {wave}. I want to hear it from the inside.",
        nudge: "You've not got that far in. I'd know.",
        done: ["I heard every one of those. I could tell you which wall you were against.", "That's my map finished, and you walked it. Go well."],
    },

    // Spelunker Odd — goes further than is sensible. Reckless, cheerful, no sense of danger.
    odd_1: {
        problem: ["Everyone stops at the seventh. There's a draught and they decide it means something.", "It means there's more cave. That's ALL a draught has ever meant."],
        ask: "Go one chamber further than sensible — the {n_zone}th.",
        nudge: "You've not passed it yet. Go on!",
        done: ["HA. And nothing happened, did it. Nothing ever does.", "Well. Something did happen to me once, down there."],
    },
    odd_2: {
        problem: ["I saw something past the ninth and nobody believes me, including me.", "The {foe}. Big as a cart and it went through stone like it was owed."],
        ask: "Find the {foe} and settle whether I'm a liar.",
        nudge: "Still just my word for it, then.",
        done: ["You saw it! You SAW it. I'm not mad, I'm just early.", "That's everything I've got. Go further than I did — somebody should."],
    },

    // ═══ MAP 3 · THE SUNKEN FEN ══════════════════════════════════════════════════════════════════════
    // Reedcutter Sil — harvests the blades. Practical, suspicious of anything new.
    sil_1: {
        problem: ["I cut reed. I've cut reed here for twenty years and the fen and I had an arrangement.", "To re-edge my blades I need {part}, and it only comes up in the deep water now."],
        ask: "Bring me {n} {part} from where the water goes over your knee.",
        nudge: "Nothing yet. Blades are still blunt.",
        done: ["That'll take an edge. Good.", "Now the part of the arrangement that's been broken."],
    },
    sil_2: {
        problem: ["The reeds cut back. I said that when you arrived and you thought I was being poetic.", "It's the {foe} in among them. They move the blades. I've the scars to prove it."],
        ask: "Clear {n} of the {foe} out of the reed beds.",
        nudge: "Still bleeding out there, am I.",
        done: ["{n}. I cut a full row this morning without once being cut back.", "I'd like a tool that assumes the worst, though."],
    },
    sil_3: {
        problem: ["Every handle I've had has rotted or snapped at the worst moment.", "{part} doesn't rot. Doesn't float either, mind, so don't drop it."],
        ask: "Take {part} to the bench and make me a handle that holds.",
        nudge: "Still working with the old one.",
        done: ["That's a lifetime handle. I'll not need another.", "One last thing, and it's the one I can't teach."],
    },
    sil_4: {
        problem: ["You cut the fen standing in it. Not from a boat, not from a bank — in it.", "Most people manage an hour and go home shaking."],
        ask: "Stand in the wet in the {n_zone}th stretch and clear it without stepping out.",
        nudge: "You came out. It doesn't count if you come out.",
        done: ["You stood it. Twenty years and I've seen four people stand it.", "That's my lot. You cut reed now, whatever else you do."],
    },

    // The Bog-Priest — tends something under the water. Ominous, calm, unsettlingly cheerful.
    priest_1: {
        problem: ["The {foe} were people who went under without meaning to. That's the whole difference.", "They'd be better off settled, and settling them is a kindness, whatever it looks like."],
        ask: "Settle {n} of the {foe}. Do it gently if you can manage it.",
        nudge: "They're still unsettled. So am I.",
        done: ["{n} at rest. The water's a shade clearer, which it always is after.", "Something under there noticed. It usually doesn't."],
    },
    priest_2: {
        problem: ["I tend a thing under this water. I've never seen it and I don't want to.", "But it has answered you three times now, and when it answers it should be met."],
        ask: "Go down and meet the {foe}.",
        nudge: "It's still waiting. It's very good at waiting.",
        done: ["You met it and you're standing here. That's new for everybody.", "There's one more place it would like you seen."],
    },
    priest_3: {
        problem: ["There's a ring down here where the fen watches people fight.", "I've never known what it's for. I've stopped asking what things are for."],
        ask: "Go into the ring and reach wave {wave}. Let it see you.",
        nudge: "Not far enough in yet.",
        done: ["It saw. The water's been still since you went in, and still is rare.", "Nothing more from me. Go up — you've been under long enough."],
    },

    // Stiltwalker Nim — never touches the ground. Proud, fussy, quietly superior.
    nim_1: {
        problem: ["Eleven years. Not one wet foot. People think it's a trick — it's route-finding.", "There's a dry line through this marsh and almost nobody walks it."],
        ask: "Find the dry way as far as the {n_zone}th stretch. On foot. I'll allow it.",
        nudge: "You're going round. There's a way through, you know.",
        done: ["You found it. Mostly. I watched you take two wrong turnings but you found it.", "From up here you'd have seen it straight away, which is my next point."],
    },
    nim_2: {
        problem: ["From the stilts I can see every patch of {part} in this marsh. I just can't reach them.", "That is the entire tragedy of my profession."],
        ask: "Gather {n} {part} — I'll point, you bend.",
        nudge: "Left a bit. No — you've not moved at all.",
        done: ["{n}, and all of them the good ones, because I chose them.", "A useful arrangement, that. We should both retire on it. Go on."],
    },

    // ═══ MAP 4 · THE SALTWRACK COAST ═════════════════════════════════════════════════════════════════
    // Wrackpicker Coble — works the tideline. Methodical, grumbling, secretly proud of the sorting.
    coble_1: {
        problem: ["Tide brings it in, I sort it, that's the arrangement and it has worked for forty years.", "This week it's bringing more than one man sorts. Mostly {part}."],
        ask: "Work the line with me — {n} {part} up above the wrack.",
        nudge: "Line's still covered.",
        done: ["{n}. That's a morning's work done in a morning, which is unheard of.", "Now the part I mentioned. The things that sort themselves."],
    },
    coble_2: {
        problem: ["The {foe}. They come up with the wrack and then they MOVE, and they move toward me.", "Forty years I've sorted things that stayed where I put them."],
        ask: "Clear {n} of the {foe} off my tideline.",
        nudge: "Still moving about down there.",
        done: ["{n}. I sorted a whole stretch today without anything sorting me back.", "Tide's in again tonight. It'll be the same tomorrow."],
    },
    coble_3: {
        problem: ["Told you. Second tide, second mess, and this one's {part}.", "This is the job. It's not a story with an end, it's a tide."],
        ask: "Another {n} {part}, and don't let the water beat you to it.",
        nudge: "Water's coming. You're not.",
        done: ["Beat the tide. Most don't, first time.", "You're soaked through, mind. Which brings me to it."],
    },
    coble_4: {
        problem: ["Everything you own is wet and it will stay wet until it rots.", "{part} is the only thing on this coast that keeps water out."],
        ask: "Take {part} to the bench and make yourself something watertight.",
        nudge: "Still dripping, I notice.",
        done: ["Dry. You'll last out here now.", "One more. And this one isn't about sorting."],
    },
    coble_5: {
        problem: ["The sea gives everything back eventually. Everything.", "Except one thing, and I've watched the tideline for it for forty years. The {foe} kept it."],
        ask: "Find the {foe} and take back what the sea kept.",
        nudge: "It's still out there holding onto it.",
        done: ["You brought it up. Forty years and a stranger does it in a week.", "I'm not bitter. I'm mostly not bitter. Go on — that's my lot."],
    },

    // The Line-Keeper — decides where the coast ends. Bureaucratic, territorial, deadpan.
    keeper_1: {
        problem: ["There is a line. On this side, my responsibility. On the far side, not yet.", "It has moved inland twice this year and nobody has written that down but me."],
        ask: "Walk out to the line — the {n_zone}th stretch — and confirm where it actually is.",
        nudge: "You've not reached it. I'd have the report by now.",
        done: ["Confirmed, and further in than the last survey. Noted and dated.", "A line only means something if it is held."],
    },
    keeper_2: {
        problem: ["The {foe} are across it. By definition that makes them mine, which I resent.", "A line that moves because something pushed it is not a line, it is a suggestion."],
        ask: "Hold it. {n} of the {foe}, back across where they came from.",
        nudge: "The line is still where they put it, not where I did.",
        done: ["Line restored to survey. I shall update the record.", "You may consider yourself on the correct side permanently. Dismissed."],
    },

    // Netmender Oss — mends what comes back torn. Patient, slightly worried, kind.
    oss_1: {
        problem: ["Nets come home with holes in them the shape of nothing I can name.", "I can mend anything if I have cord, and cord here means {part}."],
        ask: "Bring me {n} {part} and I'll have the fleet whole by evening.",
        nudge: "Still mending with what I've got, which is nearly nothing.",
        done: ["That's good cord. Takes a knot.", "Mending the same hole every week isn't mending, though. It's losing slowly."],
    },
    oss_2: {
        problem: ["Whatever's tearing them goes through my mesh like it isn't there.", "{part} would hold it. I've wanted to try it for years and never had the hands."],
        ask: "Take {part} to the bench and build a net that holds.",
        nudge: "Bench is free. So are your hands, I'd say.",
        done: ["Look at that mesh. Nothing on this coast is getting through that.", "Only one way to know, though, and it isn't looking at it."],
    },
    oss_3: {
        problem: ["A net is a promise you make before you need it kept.", "Take it out to the {n_zone}th stretch where the worst of them are and haul it in full."],
        ask: "Hold the {n_zone}th stretch and clear it without leaving. Bring the net back whole.",
        nudge: "You've come in. The net can't prove anything on the beach.",
        done: ["Not a tear in it. Not one.", "I've nothing left to mend and nothing left to ask. Strange day. Go well."],
    },

    // ═══ MAP 5 · THE DROWNED RUINS ═══════════════════════════════════════════════════════════════════
    // The Last Mason — still repairing it. Stubborn, elegiac, proud of the craft.
    mason_1: {
        problem: ["Everyone down here is looting it. I'm repairing it. I'm aware of how that sounds.", "Good {part} still rings when you strike it. The dead stuff thuds."],
        ask: "Bring me {n} {part} — the ones that ring, not the ones that thud.",
        nudge: "Nothing that rings yet.",
        done: ["Listen to that. Every one of them true.", "Now. There's a span that's been open since before the water came."],
    },
    mason_2: {
        problem: ["An arch is a disagreement that holds still. Take the keystone out and it stops disagreeing.", "{part} is the only thing down here shaped for the gap."],
        ask: "Take {part} to the bench and cut me a keystone.",
        nudge: "The gap is still a gap.",
        done: ["Set. That arch will stand when everything round it has gone.", "I'd like to get at the next span, and I can't for the scaffold."],
    },
    mason_3: {
        problem: ["The {foe} have made the scaffold theirs. I'm seventy and I'm not arguing with them on a plank.", "They haul rope. They're quite good at it. That's not the point."],
        ask: "Clear {n} of the {foe} off my scaffold.",
        nudge: "Still can't get up there.",
        done: ["My scaffold. Mine again.", "One last thing, and it isn't masonry. Not exactly."],
    },
    mason_4: {
        problem: ["They built a ring down here and they built it properly — it's the only part that never fell.", "I've always wanted to know whether that was the stone or the luck."],
        ask: "Go into the ring and reach wave {wave}. Prove it holds.",
        nudge: "Not deep enough in to prove anything yet.",
        done: ["It held. Of course it held — look at the coursing on it.", "That's everything. Somebody will be repairing this after me, and now I know who."],
    },

    // Diver Quell — goes down and comes back less. Fatalistic, very short sentences.
    quell_1: {
        problem: ["Everything valuable is at the bottom.", "So is everything that wants you there. Those are the same sentence."],
        ask: "Get down to the {n_zone}th level. And come back up. The second half is the job.",
        nudge: "You're still dry.",
        done: ["Down and back. That's one more than most manage.", "Now you know the way, I'll tell you what's at the end of it."],
    },
    quell_2: {
        problem: ["There's a light at the bottom. It isn't a lamp and it isn't the sun.", "The {foe}. I've seen it twice and swum the other way twice."],
        ask: "Go down and find out what the {foe} is.",
        nudge: "Still down there glowing, I expect.",
        done: ["You went toward it. I've never once gone toward it.", "There's more down there now you've made it safe to look."],
    },
    quell_3: {
        problem: ["Now the dull part. The reason anybody dives.", "{part} is down in the halls you just cleared, and it won't carry itself up."],
        ask: "Go again. {n} {part}, from the bottom.",
        nudge: "Nothing up yet.",
        done: ["{n}. That's a season's diving in a week.", "Nothing more from me. You go down on purpose now — that's the whole job."],
    },

    // Archivist Vane — reads what the water left. Scholarly, obsessive about order.
    vane_1: {
        problem: ["The writing survived. The people did not. I would like to know why that order.", "The record is on {part}, which the water does not eat."],
        ask: "Bring me {n} {part} from the flooded halls. Carefully — the face, not the edge.",
        nudge: "Nothing on my table yet.",
        done: ["Four of these are a sequence. A SEQUENCE. Do you know what that means?", "It means somebody stayed long enough to write in order."],
    },
    vane_2: {
        problem: ["The {foe} nest in the archive and they nest IN the tablets. They're shuffling the record.", "I am not angry about the damage. I am angry about the order."],
        ask: "Clear {n} of the {foe} out of the archive halls.",
        nudge: "Still being rearranged in there.",
        done: ["{n}. Nothing has moved on my table since this morning. Bliss.", "There's a room I've never reached and the sequence points at it."],
    },
    vane_3: {
        problem: ["Everything I have read points at the eleventh room and then stops pointing.", "Either that is where they went or that is where they stopped writing."],
        ask: "Reach the {n_zone}th room and tell me which it is.",
        nudge: "You've not reached it. The sequence waits.",
        done: ["They stopped writing. They did not stop. That is an enormous difference.", "Which makes copying what survives rather more urgent."],
    },
    vane_4: {
        problem: ["A record kept in one place is a record waiting to be lost.", "{part} takes a cut cleanly. Copy it properly and it outlives this room."],
        ask: "Take {part} to the bench and cut me a true copy.",
        nudge: "No copy yet. The water is patient and so is the damp.",
        done: ["A second copy. The first in — well. Since.", "One more. And this one you do for yourself, not for me."],
    },
    vane_5: {
        problem: ["You have carried, cleared and copied it. You have not read it.", "Read it through, in the room it was written in, without coming out. That is how it was meant to be taken."],
        ask: "Hold the {n_zone}th room and clear it without leaving. Read it through.",
        nudge: "You came out. It does not land if you come out.",
        done: ["You read it. All of it. Say nothing about it for a day; it settles.", "The record is complete and somebody living has read it. That was my whole work. Thank you."],
    },

    // ═══ MAP 6 · THE GILDED WASTE ════════════════════════════════════════════════════════════════════
    // Assayer Dune — tells fools from fortunes. Dry, sardonic, enjoys being right.
    dune_1: {
        problem: ["Everyone brings me gold. Nobody brings me gold. You'll understand shortly.", "Start with {part}. It is not gold. It is what people who find gold also find."],
        ask: "Bring me {n} {part} and we'll establish a baseline for your eye.",
        nudge: "Nothing on the scale.",
        done: ["All {n} worthless, and consistently so, which is useful.", "Now. Actual gold."],
    },
    dune_2: {
        problem: ["{part} is what the waste looks like when it is lying to you. It is brighter than gold.", "Everything out here that shines is doing it on purpose."],
        ask: "Bring me {n} {part}. All of it. I want you to feel the weight of being wrong.",
        nudge: "Still collecting, or still believing?",
        done: ["{n}, and not a grain of gold among them. Now you know the shine.", "There is one more thing, and it is the only skill that matters out here."],
    },
    dune_3: {
        problem: ["You have been bringing it to me to be told. That is a service I will not always be alive to provide.", "{part} makes a proper assay plate. Learn to tell it yourself."],
        ask: "Take {part} to the bench and make an assay plate of your own.",
        nudge: "Still bringing it to me, I notice.",
        done: ["Now you can tell. That is the entire trade, and it took four days.", "Go and disappoint yourself without my help. That's everything."],
    },

    // The Gilt-Hunter — still convinced. Manic, optimistic, wrong, delightful.
    gilt_1: {
        problem: ["Dune told you it's not out here. Dune has never dug a hole in his life.", "I have dug four hundred. The maths is entirely on my side."],
        ask: "Go to the {n_zone}th dig with me — well, go to it. I'll catch up.",
        nudge: "You've not got there. It's the RIGHT hole, I can feel it.",
        done: ["Nothing! Which narrows it! That's progress and Dune can't take it from me.", "Right — and if that one's empty, I know which one isn't."],
    },
    gilt_2: {
        problem: ["The next right hole. I want to be clear that this is a different hole.", "Deeper. Further. Statistically this is the one."],
        ask: "Get down to the {n_zone}th dig. That's the one.",
        nudge: "Not there yet! Nearly! Go on!",
        done: ["Also nothing. BUT.", "But on the way out — you saw it too, didn't you. The big one."],
    },
    gilt_3: {
        problem: ["I TOLD them. Four hundred holes and everyone laughing and I TOLD them.", "The {foe} is guarding it. Things don't guard nothing. Things guard SOMETHING."],
        ask: "Go and take the {foe}, and we'll see who's been digging for his health.",
        nudge: "It's still sat on it. On MY it.",
        done: ["I was right. Say it. You don't have to say it. I'll say it.", "That's my lot — I'm off to find Dune. Go well, go rich."],
    },

    // Sandwright Kel — builds things the wind unbuilds. Stubborn, methodical, long-suffering.
    kel_1: {
        problem: ["Nine times I've raised this marker. Nine. The wind gets blamed and the wind is innocent.", "It's the {foe}. I've seen them at the base of it."],
        ask: "Clear {n} of the {foe} away from my markers.",
        nudge: "Still being taken down out there.",
        done: ["{n}. Nothing's touched the stump since you started.", "Tenth time, then. And this time it's built properly."],
    },
    kel_2: {
        problem: ["Nine markers of timber and hope. A tenth of the same would be stupidity.", "{part} doesn't bend and doesn't burn and the sand doesn't eat it."],
        ask: "Take {part} to the bench and make me a core that won't come down.",
        nudge: "Marker's still flat.",
        done: ["Raised. Tenth time, first time properly.", "Now I'd like somebody to actually watch it stand."],
    },
    kel_3: {
        problem: ["I've never seen one of my markers survive a night. I've only ever seen the aftermath.", "I would like one person to stand there and watch it not fall over."],
        ask: "Hold the {n_zone}th stretch and clear it without leaving. Watch it stand.",
        nudge: "You left. So did my certainty.",
        done: ["It stood. You watched it stand.", "Nobody has ever been able to tell me that before. One more thing, and it's a strange ask."],
    },
    kel_4: {
        problem: ["There's a ring out here where they build and break things for a crowd.", "I'd like to raise one in there. In front of people. While they're trying to stop me."],
        ask: "Go into the ring and reach wave {wave}. Build it where they can see.",
        nudge: "Not far enough in to build anything.",
        done: ["They saw it go up. They saw it STAY up.", "Ten markers and a witness. That's a career. Off you go."],
    },

    // ═══ MAP 7 · THE ASHEN REACH ═════════════════════════════════════════════════════════════════════
    // Cinderwarden Rook — keeps the fire where it is. Patient, military, no urgency.
    rook_1: {
        problem: ["It isn't out. It has never been out. It is waiting, and it is very patient.", "The {foe} carry it. Where they walk, the line moves."],
        ask: "Put down {n} of the {foe} and the fire stays where it is.",
        nudge: "Line's moved again. Marginally. That's how it always goes.",
        done: ["{n}. The line is where it was this morning. That is a victory and it looks like nothing.", "Now I want to know what the far edge is doing."],
    },
    rook_2: {
        problem: ["I hold this edge. I have never walked the far one.", "A warden who only knows his own side is holding a line he cannot see the back of."],
        ask: "Walk out to the {n_zone}th reach and look at the far edge.",
        nudge: "You've not reached it.",
        done: ["Hotter on that side and spreading inward. Thought so. Hate being right.", "You'll want to understand what holding actually costs."],
    },
    rook_3: {
        problem: ["Holding isn't fighting. Fighting is the easy hour.", "Holding is the eleven hours where nothing happens and you do not leave."],
        ask: "Hold the {n_zone}th reach and clear it without stepping out. It's patient. Be patient.",
        nudge: "You stepped out. So did the line.",
        done: ["You held. That's the job — the whole job, and almost nobody can do it.", "Right. Now the thing that's been feeding it."],
    },
    rook_4: {
        problem: ["Fire needs feeding and this one has never once gone hungry. That is not natural.", "The {foe}. I've watched it walk into the burn and come out larger."],
        ask: "Find the {foe} and cut off what's feeding the Reach.",
        nudge: "Still feeding, then.",
        done: ["The burn's dropped for the first time in my service. Measurably.", "One more. And this one's a formality, but formalities matter here."],
    },
    rook_5: {
        problem: ["There's a gate in the ring that they only open when the sand's at its hottest.", "Everyone who holds this line goes through it once. It isn't tradition, it's a test."],
        ask: "Go through the hot gate and reach wave {wave}.",
        nudge: "You've not reached it. The gate waits.",
        done: ["Through. Properly through.", "The fire's where it was when you arrived. You did that. Stand easy, warden."],
    },

    // The Ash-Counter — measures how far it spread. Clinical, counting, slightly haunted.
    counter_1: {
        problem: ["I count what burned. Not what it was worth. What it WAS.", "{part} is what a thing leaves. Each one was something."],
        ask: "Bring me {n} {part} from the new burn.",
        nudge: "Nothing to count yet.",
        done: ["{n}. Logged. The total is now worse than last week, which I expected and hoped against.", "The number is going up. I would like to know what is driving it."],
    },
    counter_2: {
        problem: ["The {foe} don't burn things. They carry the burn to things that will.", "Every one of them is about forty on my ledger by the end of a month."],
        ask: "Put down {n} of the {foe} and slow the number.",
        nudge: "Number's still climbing.",
        done: ["{n}. Projection's down for the first time since I started keeping it.", "Which means it is time to count it again properly."],
    },
    counter_3: {
        problem: ["A count taken once is a rumour. A count taken twice is a measurement.", "{part} from the same ground as before. Same stretch, same method."],
        ask: "Count it again — {n} {part}, from the old burn.",
        nudge: "Second count's not in.",
        done: ["Down. Genuinely down. I have recounted it twice and it is genuinely down.", "I have nothing else to ask. For the first time, I have good news to write. Go."],
    },

    // Emberwright Sol — works metal in live coals. Craftsman, heat-obsessed, warm.
    sol_1: {
        problem: ["Everything here is ruined except the small amount the heat improved.", "{part} is the second kind. Fire made it; fire can't unmake it."],
        ask: "Bring me {n} {part} out of the live coals.",
        nudge: "Nothing in the bin.",
        done: ["Look at the clarity on that. Fire did that. Nobody made it.", "Now you'll learn why I work in the coals and not beside them."],
    },
    sol_2: {
        problem: ["Cold work is for people with time. Everything out here is time-poor.", "{part} only takes a shape while it is still angry."],
        ask: "Take {part} to the bench and work it hot.",
        nudge: "It's gone cold, hasn't it. Start again.",
        done: ["Hot-worked and it held. That's the hardest thing I know how to teach.", "The coals matter as much as the hands, mind."],
    },
    sol_3: {
        problem: ["My fire is good. It is not the best fire in the Reach and I know where that is.", "The {foe} lies on it. It has been lying on it for a very long time."],
        ask: "Go and take a better coal off the {foe}.",
        nudge: "Still lying on the good stuff.",
        done: ["That coal is older than the Reach. It'll burn after we're both done.", "Right. Everything I've taught you, in one piece, now."],
    },
    sol_4: {
        problem: ["You've gathered, you've worked hot, you've fetched me a better fire.", "All of that was practice. Now make something."],
        ask: "Take {part} to the bench and make something that is yours.",
        nudge: "The bench is hot and empty.",
        done: ["That's yours. Not mine, not the Reach's. Yours.", "The forge is open to you whenever you come back this way. Go well."],
    },
};

// ── FILLING IN THE REAL NOUNS ────────────────────────────────────────────────────────────────────────────────
/**
 * Put a resolved step's actual target into a line.
 *
 * ⚠️ {n_zone} IS NOT {zone}. For a delve or a survive step the number the player cares about is the depth
 * WITHIN the map — the sixth room — while `step.zone` is the global zone number, which for map seven reads
 * as "the eighty-first room" and means nothing to anybody. `need` carries the local depth for a delve, and
 * for a survive step the depth is derived the same way questsFor does it.
 */
export function fill(text, step, names = {}) {
    if (!text) return text;
    const localZone = step.kind === "delve"
        ? step.need
        : step.zone ? ((step.zone - 1) % 12) + 1 : null;
    return String(text)
        .replaceAll("{n}", String(step.need ?? ""))
        .replaceAll("{foe}", names.foe || "it")
        .replaceAll("{part}", names.part || "the stuff")
        .replaceAll("{n_zone}", String(localZone ?? ""))
        .replaceAll("{wave}", String(step.wave ?? step.need ?? ""));
}

/** The four beats for a step. Falls back to the person's own line so a new step is flat, never broken. */
export function stepLines(stepId, npcId, fallbackLine = "") {
    return STEPS[stepId] || {
        problem: [fallbackLine || "There's something wants doing."],
        ask: "See it done.",
        nudge: "Not yet.",
        done: ["That's it done.", "Good."],
    };
}
