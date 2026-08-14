// ── PAID PACKAGES ────────────────────────────────────────────────────────────────────────────────────────────
// Isomorphic — no DB, no server-only — so the buy screen and the checkout route read one definition and cannot
// disagree about what a package contains or what it costs.
//
// A package is a store-credit purchase with something bundled on top. The money is NOT consumed: you get the
// full $5 back as spendable store credit, exactly as a plain load, plus extra coins, plus the item. That is
// what makes it an easy yes — the decoration and the coin bonus are the only things you are really "paying"
// for, and both are free in the sense that the dollars come back as goods.
//
// ⚠️ THE ITEM MUST BE UNREACHABLE ANY OTHER WAY. A package item that some pool can also roll is not a package,
// it is a shortcut — and the moment one drops for free the purchase looks like a con. `deco_petting_stand`
// carries `source: "package"`, which no hand-out path in the game matches. See decorations.js.

export const PACKAGES = [
    {
        id: "petting_stand",
        name: "The Petting Stand",
        blurb: "Three of your companions on display — earning, counted, and worth double to pet.",
        priceCents: 500,
        // What lands. `creditCents` is handed back as spendable store credit, so the $5 is not spent, it moves.
        creditCents: 500,
        coins: 2000,
        decoId: "deco_petting_stand",
        // The coin line is the hook and it should be stated as one: a plain $5 load pays 1,000 coins
        // (COINS_PER_CENT = 2), so this is exactly double. If that constant ever moves, move this with it.
        coinsNote: "double the coins a normal $5 load pays",
        perks: [
            "$5 store credit — the full amount, spendable in the shop",
            "2,000 coins — double a normal $5 load",
            "The Petting Stand, which cannot be bought, won, found or gifted any other way",
        ],
    },
];

export const packageById = (id) => PACKAGES.find((p) => p.id === String(id || "")) || null;

// The DB setting that opens a package to members. Absent or anything but "on" means owner-only, which is how
// every one of these ships: built, testable by the owner on the live site, invisible to everybody else.
export const packageSettingKey = (id) => `package.${id}`;
