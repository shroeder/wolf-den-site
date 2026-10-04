import "server-only";

import { db } from "@/lib/db";
import { HALLOWEEN_PUBLIC } from "@/lib/marketplace/halloween.js";
import { storeDay } from "@/lib/marketplace/store-day.js";
import { CONSUMABLES, grantConsumable } from "@/lib/marketplace/consumables.js";
import { addChests } from "@/lib/marketplace/chests.js";

// ── TRICK OR TREAT ───────────────────────────────────────────────────────────────────────────────────────
// Luke: "you can trick or tre[a]t day in town. Which each npc and building."
//
// Every door in the plaza can be knocked on once a day. Each one answers in its own voice, hands over some
// candy, and occasionally produces something better.
//
// ⚠️ ONE KNOCK PER DOOR PER DAY IS ENFORCED BY A PRIMARY KEY, NOT BY A COUNTER. mkt_trick_or_treat is keyed
// (buyer_id, door, day) and the insert is ON CONFLICT DO NOTHING, so a double-tap on a phone cannot pay
// twice no matter how the requests interleave. A server-side "have they already" read followed by a write is
// the same race the boss swing counter had to be rewritten to close.
//
// ⚠️ AND THE DAY IS PASSED IN, NEVER COMPUTED WITH NOW(). The session zone is UTC, so a `(NOW() AT TIME ZONE
// 'America/Chicago')::date` written inside the query rolls the day over at 7pm the night before for everyone.
// storeDay() is the one place that knows what day it is here.

// How much a single door is worth. EIGHTEEN doors at this rate is ~99 candy for a full round, which with a
// normal day of activities lands near 220 against the 250 cap — so the ritual is a real chunk of the day's
// earnings without being the only thing worth doing, and a member who does both will occasionally clip the
// ceiling. That is the intended shape: the cap should be reachable by someone doing everything, and only by
// them.
const PER_DOOR = [4, 7];

// A sweet as well as the candy. The sweets ARE the `kind: "candy"` consumables — Candy Corn, the Sour Worm —
// which is the one place in the game where that naming collision is a feature rather than a hazard: you go
// trick-or-treating and you come back with actual sweets.
const SWEET_CHANCE = 0.12;
// And very occasionally somebody gives out the good stuff.
const CHEST_CHANCE = 0.02;
const CHEST_TIER = "hw_candycorn";

// ⚠️ A "TRICK" COSTS NOTHING. It is a line, not a punishment — you still get your candy. A door that can
// take the night's reward away turns a daily ritual into a thing you resent doing, which is the opposite of
// why it is here; the joke is the payload.
const TRICK_CHANCE = 0.22;

// Every door, in its own voice. `treat` is what they say when they hand it over, `trick` when they decide to
// be funny about it first. Buildings talk as the person who answers; the NPCs talk as themselves.
export const DOORS = {
    tavern: { label: "The Tavern", treat: "The barkeep tips a whole jar into your bag without looking up from the glass he is drying.", trick: "“We're out.” … “We are NOT out,” says someone at the back. The barkeep sighs and pays up." },
    boss: { label: "Boss Arena", treat: "A steward hands you a fistful of sweets through the gate and tells you not to go in.", trick: "Something enormous roars behind the gate. The steward does not flinch. You do. He gives you extra for that." },
    forge: { label: "The Forge", treat: "The smith drops sweets into your bag with tongs, which is somehow more intimidating.", trick: "She holds a glowing horseshoe near your bag, waits exactly one second, then laughs and fills it." },
    auction: { label: "Auction House", treat: "The auctioneer counts your sweets out loud, as a lot, and declares you the winner.", trick: "“Do I hear nothing? Nothing once, nothing twice—” He caves immediately and hands over a scoop." },
    shop: { label: "General Store", treat: "The shopkeeper has a bowl by the door with a note that says TAKE ONE. You take several.", trick: "The bowl is empty. The shopkeeper, from behind a shelf: “…the bowl is never empty.” It is full again." },
    docks: { label: "The Docks", treat: "A deckhand pays you in sweets out of a tin he clearly keeps for himself.", trick: "He pretends to drop the tin in the water. He does not. He is extremely pleased with this." },
    farm: { label: "The Farm", treat: "Somebody presses candied apples into your hands and asks after your pets by name.", trick: "A scarecrow you walked past twice is now facing the other way. There are sweets in its pocket." },
    vault: { label: "The Vault", treat: "A clerk slides a sealed envelope of sweets under the grille and stamps your hand.", trick: "“Withdrawal denied.” A pause. “…tonight only, approved.” The grille opens." },
    festival: { label: "Festival Stage", treat: "The crowd throws sweets at you. Some of it is even aimed.", trick: "A conjurer makes your bag vanish. It comes back heavier. He will not explain." },
    mine: { label: "The Mine", treat: "A miner taps a bucket of sweets with his pick and nods you towards it.", trick: "The lanterns all go out at once. When they come back everyone is holding sweets and nobody is admitting anything." },
    kitchen: { label: "The Kitchen", treat: "The cook will not let you leave until you have taken something warm and something sticky.", trick: "“Try this.” It is unidentifiable. It is delicious. You get sweets for being brave." },
    delves: { label: "Dungeons", treat: "The keeper at the stair hands out sweets and advice. The advice is “don't”.", trick: "Something under the floor knocks back. The keeper pays you quickly and shuts the door." },
    market: { label: "The Market", treat: "Three stalls at once decide you look hungry. You leave considerably heavier.", trick: "A trader offers you a bargain bag of sweets. It is free. It is full. There is no catch and it is unnerving." },
    casino: { label: "The Casino", treat: "The dealer fans sweets out like a hand of cards and lets you pick.", trick: "“Double or nothing?” You say nothing. “Double it is,” he says, and doubles it." },
    crier: { label: "The Town Crier", treat: "He announces your arrival, your costume and your candy total to the entire plaza.", trick: "He rings the bell directly beside your ear and apologises with sweets." },
    smith: { label: "The Blacksmith", treat: "A sweet still warm from sitting too near the forge. It is better that way.", trick: "He has hidden the sweets inside a helmet. You must retrieve them. He times you." },
    merchant: { label: "The Traveling Merchant", treat: "He produces sweets from a pocket you are certain was not there a moment ago.", trick: "He tries to sell you your own sweets back. He is laughing before he finishes the sentence." },
    quest: { label: "The Quest Giver", treat: "She writes “TREAT — DELIVERED” on a scroll, stamps it, and hands you the sweets.", trick: "She makes you say the whole rhyme. All of it. In front of people. Then she pays double." },
};

export const DOOR_IDS = Object.keys(DOORS);

const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** Which doors this member has already knocked on today. */
export async function knockedToday(buyerId) {
    if (!buyerId || !HALLOWEEN_PUBLIC) return [];
    const rows = await db.query(
        `SELECT door FROM mkt_trick_or_treat WHERE buyer_id = $1 AND day = $2::date`,
        [buyerId, storeDay().dayKey],
    ).catch(() => []);
    return (rows || []).map((r) => r.door);
}

/**
 * Knock on one door.
 *
 * ⚠️ THE ROW IS CLAIMED BEFORE ANYTHING IS PAID. The INSERT ... ON CONFLICT DO NOTHING RETURNING is the lock:
 * if it returns nothing, somebody (or the same thumb twice) already has this door today and we stop without
 * paying. Granting first and recording second is how a door pays twice.
 */
export async function knock(buyerId, door) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    if (!HALLOWEEN_PUBLIC) return { ok: false, error: "closed" };
    const d = DOORS[door];
    if (!d) return { ok: false, error: "no_such_door" };

    const candy = rnd(PER_DOOR[0], PER_DOOR[1]);
    const trick = Math.random() < TRICK_CHANCE;

    const claimed = await db.queryOne(
        `INSERT INTO mkt_trick_or_treat (buyer_id, door, day, candy, treat)
         VALUES ($1, $2, $3::date, $4, $5)
         ON CONFLICT (buyer_id, door, day) DO NOTHING
         RETURNING door`,
        [buyerId, door, storeDay().dayKey, candy, trick ? "trick" : "treat"],
    ).catch(() => null);
    if (!claimed) return { ok: false, error: "already_knocked" };

    // ⚠️ PAID THROUGH grantCandy, NOT A BARE UPDATE. The daily cap lives in that function, and a door that
    // wrote straight to the balance would be a faucet outside the only ceiling the event has.
    const { grantCandy } = await import("@/lib/marketplace/candy.js");
    // Rated 1 in CANDY_RATES because the door decides the amount; the multiplier carries the payout.
    const paid = await grantCandy(buyerId, "trick_or_treat_door", candy);

    let sweet = null;
    let chest = null;
    if (Math.random() < SWEET_CHANCE) {
        const sweets = Object.keys(CONSUMABLES).filter((id) => CONSUMABLES[id].kind === "candy");
        const id = sweets[Math.floor(Math.random() * sweets.length)];
        await grantConsumable(buyerId, id).catch(() => {});
        sweet = { id, name: CONSUMABLES[id].name, emoji: CONSUMABLES[id].emoji };
    }
    if (Math.random() < CHEST_CHANCE) {
        await addChests(buyerId, { [CHEST_TIER]: 1 }, { source: "trick_or_treat" }).catch(() => {});
        chest = CHEST_TIER;
    }

    return {
        ok: true,
        door,
        label: d.label,
        trick,
        line: trick ? d.trick : d.treat,
        candy: paid,
        sweet,
        chest,
    };
}
