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

// One entry today, and no rotation/scheduling machinery on purpose — see featuredPackage in packages-server.js
// for why that was deferred rather than forgotten.
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
        // ── WHAT THE CARD SHOWS, AND WHY IT IS DATA ──────────────────────────────────────────────────────
        // A package is the one screen in the game whose job is to SELL, so it gets the item drawn at size with
        // pets actually sitting on it — a member should understand what they are buying by looking, not by
        // reading. These three are the demo companions on the tiers: a wolf pup (the Den's own animal), a bear
        // cub and a flamingo, chosen to be instantly different from each other at a glance.
        demoPets: ["wolf_pup", "bear_cub", "flamingo"],
        // The three things you actually receive, drawn as tiles. `big` is the number that gets the large type.
        gets: [
            { key: "credit", big: "$5.00", label: "store credit", note: "the full amount, back in your pocket", icon: "/images/nav/credit.png" },
            { key: "coins", big: "2,000", label: "coins", note: "double a normal $5 load", icon: "/images/ui/coin.png" },
            { key: "stand", big: "1", label: "Petting Stand", note: "not sold, won or gifted anywhere else", deco: true },
        ],
        // How it works, in one line each, in the order they matter. `icon` is a react-icons/gi NAME, not an
        // emoji — emoji are the OS's artwork, different on every device, and this card is meant to look like
        // the game rather than like a text message. PackageCard maps the name to the component.
        does: [
            { icon: "GiPawPrint", head: "Three pets on display", body: "They earn passive XP exactly as your equipped pet does — a full stand is four companions levelling instead of one." },
            { icon: "GiHand", head: "Worth double to pet", body: "Every petting on the stand gives twice the usual XP. Yours and every visitor's." },
            { icon: "GiCutDiamond", head: "Shows how rare they are", body: "Each tier says how many members own that companion. Yours might be the only one in the Den." },
        ],
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
