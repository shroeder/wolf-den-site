import "server-only";

import { db } from "@/lib/db";
import { halloweenOn } from "@/lib/marketplace/owner.js";
import { spendCandy, candyBalance } from "@/lib/marketplace/candy.js";
import { CHEST_TIERS, addChests } from "@/lib/marketplace/chests.js";
import { getChestArt } from "@/lib/marketplace/chest-art.js";
import { COLLECTIBLES } from "@/lib/marketplace/collectibles.js";
import { ITEMS } from "@/lib/marketplace/items.js";
import { decorationById } from "@/lib/marketplace/decorations.js";

// ── THE GOURDFATHER ──────────────────────────────────────────────────────────────────────────────────────
// Luke: "The new town npc will be a giant talking pumpkin. With lots to say. Hes silly and crazy dialogue."
//
// A pumpkin the size of a cart, parked in the plaza for one month, who will not stop talking. He sells things
// for candy and he has opinions about all of them.
//
// ⚠️ THE LINES ARE THE FEATURE, NOT DRESSING ON IT. A vendor with three barks is a menu with a face drawn on
// it. There are sixty-odd here across six moods, which is enough that a member who visits every day for the
// whole event is still hearing new ones at the end of it — and that is the difference between an NPC and a
// button.
//
// ⚠️ AND HE NEVER BREAKS THE FOURTH WALL OR MENTIONS THE SHOP'S REAL BUSINESS. Same rule the Arbiter's posts
// follow: he is a character in the Den, not a notice from us wearing a costume.

// What he says standing in the street, on a rotation. Kept SHORT — these render in a speech bubble over his
// head on a phone, and a bubble that wraps to four lines covers the street behind him.
export const IDLE_LINES = [
    "I am a pumpkin. I am ENORMOUS. Let us begin there.",
    "Candy! Hand it over! Politely! I am asking politely!",
    "I grew myself. Took ages. Worth it.",
    "Do NOT tell me about pie. I will know.",
    "Every year they say “not again”. Every year: again.",
    "I have a stall. I have WARES. Come and look at my WARES.",
    "Psst. Kid. You like cats? I have got a cat.",
    "I am not stuck here. I simply have no legs. Different thing entirely.",
    "The vine is structural. Do not pull it.",
    "SWEETS. For GOODS. This is the whole arrangement.",
    "I knew your grandfather. He also owed me candy.",
    "Nine nights! Count them! I did!",
    "There is a dog made of pumpkin and it is MY SON.",
    "Somebody put a candle in me in 1847 and frankly I have thrived.",
    "Buy something. Or don't. I will simply watch you. Forever.",
    "I contain seeds. Hundreds. Do not ask how many. I have counted. It is upsetting.",
    "The scarecrow and I are NOT speaking.",
    "HOY! You! With the face! Yes! Everyone has one!",
    "I can see the moon. It is also round. We are not related.",
    "If a wolf tells you I am soft, that wolf is LYING.",
    "Business is good. Business is candy. Candy is good. Follow the logic.",
    "I do not sleep. I ripen.",
    "Another one! Another customer! I am BESIDE myself! I cannot be, I am one piece, but STILL!",
    "Try the cauldron. Not IN the cauldron. Try buying the cauldron.",
    "Some say I am too large. Some people are cowards.",
    "The golem is made of sweets and it is LOYAL. Think about that.",
    "I remember every single person who walked past. Every one.",
    "You there! Are those pockets? Are there SWEETS in those pockets?",
    "I am having the best month of my entire life and it happens every year.",
    "Crypt's open. Mind the candles. Mind the king. Mind everything, really.",
    "No, I will not be here in November. Do not make it weird.",
    "A fine evening for standing absolutely still and shouting!",
];

// Opening the stall.
export const GREET_LINES = [
    "AH! A customer! Come in! There is no in! Come CLOSER!",
    "Welcome, welcome. Mind the vine. MIND THE VINE.",
    "You have candy. I can smell it. I do not have a nose. We move on.",
    "Everything here is real and mine and for sale. Mostly in that order.",
    "Look at it all! LOOK AT IT! I have been arranging this for weeks!",
    "I will not haggle. I will, however, talk at you until you buy something.",
    "Step up! Nothing in this stall has bitten anyone THIS year!",
    "You again! Wonderful! Terrible! WONDERFUL!",
    "Sweets in, treasures out. It is a beautiful trade and I invented it.",
    "Please do not tap the golem. He is shy. He is also enormous.",
    "Everything is priced in candy, because gold is BORING and I said so.",
    "Browse! Linger! Make the face people make when they want a thing!",
];

// Something was bought.
export const BUY_LINES = [
    "YES! A transaction! I am VIBRATING!",
    "Sold! Gone! Yours! Out of my sight, I love you!",
    "Take it, take it, before I grow attached. Too late. Go.",
    "A fine choice. All of my choices are fine. I chose them.",
    "Wrapped it in a leaf. That is the service tier you have purchased.",
    "DELIGHTFUL. Tell your friends. Tell your enemies. Tell EVERYONE.",
    "That one was my favourite. They are all my favourite. GO.",
    "Pleasure doing business. Genuinely. I have so little else going on.",
    "Mind how you carry it. Actually, carry it however you like. I am a pumpkin.",
    "Another satisfied customer! That makes... let me think... one more than before!",
];

// Not enough candy.
export const BROKE_LINES = [
    "Not enough! NOT ENOUGH! Go and be industrious!",
    "You are short. I have counted. Counting is the one thing I am good at.",
    "Come back with sweets. I will be here. I am always here. Help.",
    "Ah. The pockets are empty. The eyes are hopeful. It is not enough.",
    "I take candy. Only candy. Not promises. I have HEARD promises.",
    "Go and knock on some doors! People give sweets to anyone these days!",
    "No no no. More. MORE. You are so close. You are not close at all.",
    "I would front you the candy, but then I would have less candy.",
];

// Already owned.
export const OWNED_LINES = [
    "You HAVE one. I watched you buy it. I was THERE.",
    "One is plenty. Two would be showing off.",
    "That one is already yours! Look at it! Look at it at home!",
    "I cannot sell you the same thing twice. I have TRIED.",
];

// Closing the stall.
export const LEAVE_LINES = [
    "Off you go! Come back! Those are both instructions!",
    "Goodbye! I will think about you constantly!",
    "Mind the step. There is no step. Mind it anyway.",
    "Take care out there. The dog bites. The dog is my son. Both true.",
];

/** One line, chosen by an index the caller controls, so a re-render does not reshuffle his mouth. */
export const lineFrom = (bank, n) => bank[Math.abs(Math.round(Number(n) || 0)) % bank.length];

// ── THE STALL ────────────────────────────────────────────────────────────────────────────────────────────
// Priced against what the event can actually mint. The candy cap is 250 a day and a real day of play is
// nearer 120, so a committed member finishes the month on roughly 3,500 and a completionist on maybe 6,000.
// The stall totals 10,830 ON PURPOSE — roughly three times a committed month: nobody clears it, so every
// member spends the month deciding what they want most. A shop you can finish stops being interesting in week two.
//
// `kind` decides what buying it DOES; everything else is display, read from the real catalogues so a price
// list can never drift from the thing it is pricing.
export const STALL = [
    // Gift boxes — the Hallowe'en chests, which are otherwise only a substitution on a chest you were already
    // getting. Here they are a thing you can simply decide to buy.
    { id: "hw_candycorn", kind: "chest", candy: 120 },
    { id: "hw_pumpkin", kind: "chest", candy: 240 },
    { id: "hw_skeleton", kind: "chest", candy: 420 },
    { id: "hw_ghost", kind: "chest", candy: 700 },
    // Farm decorations.
    { id: "deco_gf_black_cat", kind: "deco", candy: 250 },
    { id: "deco_gf_candy_cauldron", kind: "deco", candy: 450 },
    { id: "deco_gf_lantern_arch", kind: "deco", candy: 450 },
    { id: "deco_gf_gourd_throne", kind: "deco", candy: 1200 },
    // Harvest's End, a piece at a time. 2,500 for the set — the single biggest thing a member can commit to.
    { id: "gf_hollowed_crown", kind: "item", candy: 500 },
    { id: "gf_harvest_mantle", kind: "item", candy: 500 },
    { id: "gf_furrow_walkers", kind: "item", candy: 500 },
    { id: "gf_reapers_due", kind: "item", candy: 500 },
    { id: "gf_ninth_night", kind: "item", candy: 500 },
    // The pets. The golem is the headline and is priced to be a month's ambition.
    { id: "gf_gourdpup", kind: "pet", candy: 900 },
    { id: "gf_wispling", kind: "pet", candy: 1400 },
    { id: "gf_candy_golem", kind: "pet", candy: 2200 },
];

const byId = (id) => STALL.find((x) => x.id === id) || null;

/** What the stall looks like to this member: prices, art, and what they already hold. */
export async function stallView(buyerId) {
    if (!halloweenOn(buyerId)) return { open: false, stock: [], candy: 0 };

    // ── THE ART, FOUR TABLES AT ONCE ──────────────────────────────────────────────────────
    // ⚠️ EVERY WARE IN HERE ALREADY HAD A SPRITE AND THE STALL WAS DRAWING NONE OF THEM. Items, pets and
    // decorations each keep their art in their own table and chests keep theirs in a settings blob, so a shop
    // that sells all four has to ask four places — and the first version of this asked none, which is why
    // Luke's note was "sprites for each item". The whole catalogue is 16 rows; these are four indexed reads
    // in the same Promise.all as the ownership checks, so the shelf costs no extra round trip.
    const ids = { item: [], pet: [], deco: [], chest: [] };
    for (const w of STALL) ids[w.kind]?.push(w.id);
    const [ownedPets, ownedItems, ownedDecos, candy, itemArt, petArt, decoArt, chestArt] = await Promise.all([
        // ⚠️ PETS ARE COSMETIC UNLOCKS, not their own table — `category = 'pet'` in mkt_cosmetic_unlock.
        // There is no mkt_user_collectible; grantPet writes here and so does every other pet source.
        db.query(`SELECT ref AS id FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet'`, [buyerId]).catch(() => []),
        db.query(`SELECT item_id AS id FROM mkt_user_item WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        db.query(`SELECT deco_id AS id FROM mkt_deco_owned WHERE buyer_id = $1`, [buyerId]).catch(() => []),
        candyBalance(buyerId),
        db.query(`SELECT item_id AS k, url FROM mkt_item_sprite WHERE item_id = ANY($1)`, [ids.item]).catch(() => []),
        db.query(`SELECT pet_id AS k, url FROM mkt_pet_sprite WHERE pet_id = ANY($1)`, [ids.pet]).catch(() => []),
        db.query(`SELECT deco_id AS k, url FROM mkt_deco_sprite WHERE deco_id = ANY($1)`, [ids.deco]).catch(() => []),
        getChestArt().catch(() => ({})),
    ]);
    const sprite = Object.fromEntries([...itemArt, ...petArt, ...decoArt].map((r) => [r.k, r.url]));
    for (const t of ids.chest) if (chestArt?.[t]) sprite[t] = chestArt[t];
    const have = new Set([...ownedPets, ...ownedItems, ...ownedDecos].map((r) => r.id));

    const stock = STALL.map((row) => {
        const base = { ...row, owned: false, name: row.id, blurb: null, rarity: null, sprite: sprite[row.id] || null };
        if (row.kind === "chest") {
            const c = CHEST_TIERS[row.id];
            // ⚠️ NO BLURB. All four said the same sentence, under a shelf heading that says it once already —
            // four identical lines of italic text under four different pictures, which reads as a template
            // nobody finished. The picture and the price are the whole of what distinguishes these.
            return { ...base, name: c?.label || row.id, rarity: "rare", emoji: c?.emoji || null };
        }
        if (row.kind === "pet") {
            const p = COLLECTIBLES.find((x) => x.id === row.id);
            // ⚠️ A PET IS OWN-ONCE. Everything else here can be bought again; selling somebody a second copy
            // of a pet takes their candy and writes nothing, which is the duplicate-trophy bug the wheel's
            // bonus round already paid for once.
            return { ...base, name: p?.name || row.id, rarity: p?.rarity || "epic", blurb: p?.hint || null, owned: have.has(row.id) };
        }
        if (row.kind === "item") {
            const i = ITEMS.find((x) => x.id === row.id);
            return { ...base, name: i?.name || row.id, rarity: i?.rarity || "legendary", slot: i?.slot || null, blurb: i?.flavor || null, owned: have.has(row.id) };
        }
        const d = decorationById(row.id);
        return { ...base, name: d?.name || row.id, rarity: d?.rarity || "rare", blurb: d?.buff ? null : "Purely for looking at.", owned: have.has(row.id) };
    });

    return { open: true, candy, stock };
}

/** Buy one thing. Spends first (atomically), then grants — see the note on the order. */
export async function buyFromStall(buyerId, id) {
    if (!buyerId) return { ok: false, error: "not_signed_in" };
    if (!halloweenOn(buyerId)) return { ok: false, error: "closed" };
    const row = byId(id);
    if (!row) return { ok: false, error: "no_such_item" };

    // Own-once things are refused BEFORE any candy moves. The alternative — spend, then discover, then
    // refund — is three writes where one of them can fail, and the failure mode is a member who paid for a
    // duplicate and got nothing.
    if (row.kind === "pet" || row.kind === "item" || row.kind === "deco") {
        const has = row.kind === "pet"
            ? await db.queryOne(`SELECT 1 FROM mkt_cosmetic_unlock WHERE buyer_id = $1 AND category = 'pet' AND ref = $2 LIMIT 1`, [buyerId, id]).catch(() => null)
            : row.kind === "deco"
                ? await db.queryOne(`SELECT 1 FROM mkt_deco_owned WHERE buyer_id = $1 AND deco_id = $2 LIMIT 1`, [buyerId, id]).catch(() => null)
                : null;
        // ⚠️ GEAR IS NOT OWN-ONCE AND THE OTHER TWO ARE. A second Reaper's Due is a real second sword you can
        // wear, trade or salvage, so buying one again is a legitimate purchase. A second pet and a second
        // decoration both write nothing — ownership there is binary — so selling one is taking candy for air.
        if (has) return { ok: false, error: "already_owned" };
    }

    // ⚠️ SPEND FIRST. spendCandy is one conditional UPDATE and is the only thing here that can tell two
    // simultaneous taps apart; granting first would hand over two pets and charge for one.
    const paid = await spendCandy(buyerId, row.candy, `gourdfather:${id}`, { kind: row.kind });
    if (!paid.ok) return { ok: false, error: paid.error };

    let granted = null;
    if (row.kind === "chest") {
        await addChests(buyerId, { [id]: 1 }, { source: "gourdfather" }).catch(() => {});
        granted = { kind: "chest", id, name: CHEST_TIERS[id]?.label || id };
    } else if (row.kind === "pet") {
        const { grantPet } = await import("@/lib/marketplace/pet-drops.js");
        const pet = COLLECTIBLES.find((x) => x.id === id);
        // grantPet takes the pet OBJECT, not an id — it reads name/rarity/colour off it for the reveal card.
        await grantPet(buyerId, pet, "gourdfather").catch(() => {});
        granted = { kind: "pet", id, name: pet?.name || id };
    } else if (row.kind === "item") {
        const { grantItem } = await import("@/lib/marketplace/inventory.js");
        await grantItem(buyerId, id, "gourdfather").catch(() => {});
        granted = { kind: "item", id, name: ITEMS.find((x) => x.id === id)?.name || id };
    } else {
        const { grantDecoration } = await import("@/lib/marketplace/farm-decorations.js");
        await grantDecoration(buyerId, id, 1, "gourdfather").catch(() => {});
        granted = { kind: "deco", id, name: decorationById(id)?.name || id };
    }

    return { ok: true, granted, candy: paid.balance };
}
