// ── GETTING A REAL CARD OUT OF ONE STRING ───────────────────────────────────────────────────────────────────
// The reveal promises the member "its value, set, number, condition, all the stuff". The pool cannot answer
// three of those four from its own columns: `buildMysteryPickerUpsertRequest` in the Android app writes the
// LITERAL STRING "Square" as set_name and a fragment of the packed barcode as card_number. Measured against
// prod on 2026-10-26: 79 of 79 active rows, 100%.
//
// The data is not missing, though — it is all inside `card_name`:
//
//     Jirachi XYPROMO XY67a NM
//     M Gardevoir EX (Full Art) RC31/RC32 Ultra Rare NM
//     Iono's Kilowattrel - 163/159 JTG Illustration Rare NM
//
// name, optional set code, collector number, printed rarity, condition. So this parses, and does NOT try to
// match `tcg_cards`: exact-name matching resolves 12 of 79 (15%) precisely because of those appended tokens,
// and a fuzzier matcher would confidently attach the wrong card — the lesson already written down at the top
// of cogs/link-variation.js. `tcg_cards` stays useful for live VALUATION, where a confident match is a bonus
// rather than a requirement.
//
// ⚠️ IT PARSES RIGHT-TO-LEFT, AND THAT IS THE WHOLE DESIGN. Card names are unbounded on the left — "M Gardevoir
// EX (Full Art)", "All-Night Party", "Iris's Fighting Spirit", "Light Togetic" — but the tail is a small fixed
// vocabulary. So the known things are peeled off the end in order and whatever survives is the name. Trying to
// find the name first means guessing where it stops.
//
// ⚠️ AND IT NEVER INVENTS. Anything it cannot identify stays in the name rather than being forced into a
// field, and every field is independently nullable. 24 of the 79 rows carry no condition at all; the readout
// shows what parsed and silently omits what did not. It must never print "Square" at a member.

/** Condition grades, as the intake writes them. Checked at the very end of the string. */
const CONDITIONS = ["NM-MT", "NM", "LP", "MP", "HP", "DMG", "PL", "GD", "EX-NM"];

/**
 * Printed rarities, LONGEST FIRST — the order is load-bearing. "Special Illustration Rare" must win over
 * "Illustration Rare", which must win over "Rare", or "Pikachu (Secret) 160/159 Secret Rare" parses as a card
 * called "Pikachu (Secret) 160/159 Secret".
 */
const RARITIES = [
    "Special Illustration Rare",
    "Illustration Rare",
    "Radiant Rare",
    "Double Rare",
    "Secret Rare",
    "Hyper Rare",
    "Ultra Rare",
    "Holo Rare",
    "Shiny Rare",
    "ACE SPEC Rare",
    "Amazing Rare",
    "Promo",
    "Uncommon",
    "Common",
    "Rare",
];

const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();

/** Trailing joiners the intake leaves behind once the tail is peeled off ("Marill -" → "Marill"). */
const trimTail = (v) => clean(v).replace(/[\s–—-]+$/, "").trim();

/** Does this token carry a collector number? `46/95`, `XY67a`, `SWSH185`, `RC31/RC32`, `122`. */
const isNumberToken = (t) => /\d/.test(t) && !/^\(.*\)$/.test(t);

/**
 * The intake is inconsistent about the joiner before the number — "Marill - 204/193" separates it, but
 * "Rayquaza EX -BW47 Promo" glues it on. Strip the stray punctuation off the ends so the number is the
 * number; `/` survives because `RC31/RC32` needs it.
 */
const tidyNumber = (t) => String(t || "").replace(/^[^A-Za-z0-9]+/, "").replace(/[^A-Za-z0-9/]+$/, "");

/**
 * ⚠️ CARD-NAME SUFFIXES THAT LOOK EXACTLY LIKE SET CODES, AND ARE NOT.
 *
 * "Rayquaza EX -BW47" parsed as a card called "Rayquaza" from a set called "EX", because EX is two capitals
 * and so is PLF. These are part of the creature's name — "Snorlax GX", "Raichu V", "Hisuian Decidueye V" —
 * and moving one into the set field renames the card the member just pulled.
 */
const NAME_SUFFIXES = new Set(["EX", "GX", "V", "VMAX", "VSTAR", "VUNION", "BREAK", "TAG", "LV.X", "SP"]);

/**
 * A set abbreviation sitting between the name and the number — `PLF`, `HS`, `MEW`, `SF`, `XYPROMO`, or the
 * `JTG`/`SMP` that sometimes trail the number instead.
 *
 * ⚠️ The all-caps test is what keeps "(Delta Species)" and "(Full Art)" out of this field. Those are part of
 * the card's NAME and belong with it — "Horsea - 031/101 (Delta Species) Uncommon" is a real row.
 */
const isSetToken = (t) => /^[A-Z0-9]{2,8}$/.test(t) && /[A-Z]/.test(t) && !NAME_SUFFIXES.has(t);

/**
 * Pull a card out of the one string the pool actually stores.
 *
 * Returns `{ name, setCode, number, rarity, condition }` — every field nullable except `name`, which falls
 * back to the original string so a caller always has something to show.
 */
export function parsePackCardName(raw) {
    const original = clean(raw);
    const empty = { name: original, setCode: null, number: null, rarity: null, condition: null };
    if (!original) return { ...empty, name: "" };

    let rest = original;
    let condition = null;
    let rarity = null;

    // 1 — the condition grade, which is always last when it is there at all.
    for (const grade of CONDITIONS) {
        const re = new RegExp(`\\s${grade.replace(/[-]/g, "\\-")}$`, "i");
        if (re.test(rest)) {
            condition = grade;
            rest = trimTail(rest.replace(re, ""));
            break;
        }
    }

    // 2 — the printed rarity, longest phrase first.
    for (const r of RARITIES) {
        const re = new RegExp(`\\s${r.replace(/\s/g, "\\s")}$`, "i");
        if (re.test(rest)) {
            rarity = r;
            rest = trimTail(rest.replace(re, ""));
            break;
        }
    }

    // 3 — the collector number: the LAST token carrying a digit. Taking the last one rather than the first is
    //     what makes "Roserade (15) 15/124" resolve to 15/124 instead of to the (15) in its own name.
    const tokens = rest.split(" ").filter(Boolean);
    let numberIndex = -1;
    for (let i = tokens.length - 1; i >= 0; i -= 1) {
        if (isNumberToken(tokens[i])) { numberIndex = i; break; }
    }

    if (numberIndex === -1) return { ...empty, name: trimTail(rest) || original, rarity, condition };

    const number = tidyNumber(tokens[numberIndex]) || tokens[numberIndex];

    // 4 — a set code, on either side of the number. "Wooper PLF 21/116" puts it before; "Iono's Kilowattrel -
    //     163/159 JTG" puts it after. Anything after the number that is NOT a set code (a parenthetical
    //     qualifier) goes back onto the name, where it belongs.
    const before = tokens.slice(0, numberIndex);
    const after = tokens.slice(numberIndex + 1);

    let setCode = null;
    const nameParts = [...before];

    if (after.length && after.every(isSetToken)) {
        setCode = after.join(" ");
    } else {
        nameParts.push(...after);
    }

    if (!setCode && nameParts.length > 1 && isSetToken(nameParts[nameParts.length - 1])) {
        setCode = nameParts.pop();
    }

    // ⚠️ Lifting the number out of the MIDDLE can orphan its joiner: "Horsea - 031/101 (Delta Species)" leaves
    //    "Horsea - (Delta Species)". trimTail only reaches the end of the string, so a lone joiner token is
    //    dropped here. Only a token that is NOTHING but a dash — "All-Night Party" keeps its hyphen because
    //    that hyphen lives inside a word.
    const named = nameParts.filter((t) => !/^[–—-]+$/.test(t));

    return {
        name: trimTail(named.join(" ")) || original,
        setCode: setCode || null,
        number,
        rarity,
        condition,
    };
}

/**
 * What the reveal and the vault tile actually print under the card: the identifying line, with nothing
 * fabricated and nothing empty. Returns "" when the row told us nothing beyond its name.
 */
export function packCardSubtitle(raw) {
    const { setCode, number, rarity, condition } = parsePackCardName(raw);
    return [setCode, number, rarity, condition].filter(Boolean).join(" · ");
}
