"use client";

import CollectionPanel from "@/components/CollectionPanel";
import Leaderboard from "@/components/Leaderboard";
import Quartermaster from "@/components/Quartermaster";
import SailingBoards from "@/components/SailingBoards";

// Fixtures for the dev-only lab (see the page). Deliberately awkward: a very long display name, a ten-piece
// set, a 4-digit score — the cases that break a layout are never the tidy ones.
const face = (seed) => `/api/marketplace/avatar?seed=${seed}`;
const FLEET = [
    { place: 1, who: "The Wolf Den", avatar: face(1), level: 37, voyages: 30, form: "Ship of the Line", art: "/images/nav/sailing.png", you: true },
    { place: 2, who: "aannw", avatar: face(2), level: 18, voyages: 17, form: "Brigantine", art: "/images/nav/sailing.png" },
    { place: 3, who: "Eric D", avatar: face(3), level: 16, voyages: 13, form: "Sloop", art: "/images/nav/sailing.png" },
    { place: 4, who: "Alstier1", avatar: face(4), level: 14, voyages: 13, form: "Sloop", art: "/images/nav/sailing.png" },
    { place: 5, who: "Bartholomew Featherstonehaugh", avatar: face(5), level: 10, voyages: 8, form: "Cutter", art: "/images/nav/sailing.png" },
    { place: 6, who: "Agent420", avatar: face(6), level: 9, voyages: 9, form: "Cutter", art: "/images/nav/sailing.png" },
];
const DIG = [
    { place: 1, who: "Sunflower Jinxx", avatar: face(7), points: 1240, forged: 71 },
    { place: 2, who: "GrayKitsune", avatar: face(8), points: 980, forged: 66 },
    { place: 3, who: "Rumorleigh", avatar: face(9), points: 604, forged: 40 },
    { place: 4, who: "YoshiHwan", avatar: face(10), points: 88, forged: 12 },
];
const LOVE = [
    { place: 1, who: "The Wolf Den", avatar: face(1), score: 48, votes: 19, you: true },
    { place: 2, who: "Mama G", avatar: face(11), score: 41, votes: 16 },
    { place: 3, who: "Jrobert", avatar: face(12), score: 33, votes: 15 },
    { place: 4, who: "Hudson", avatar: face(13), score: 12, votes: 6 },
];
const SETS = [
    {
        id: "wheelwarden", name: "Wheelwarden's Fortune", total: 10, have: 2, collection: true,
        pieces: [
            { id: "wg_helm", name: "Dire Wolf Helm", icon: "GiWolfHead", owned: true, utilText: "", statsText: "" },
            { id: "wg_shield", name: "Bulwark of the Pack", icon: "GiShield", owned: false },
            { id: "wg_ring", name: "Ring of the Hunt", icon: "GiRing", owned: false },
            { id: "wg_cloak", name: "Nightfall Cloak", icon: "GiCape", owned: false },
            { id: "wg_amulet", name: "Moonlit Amulet", icon: "GiNecklaceDisplay", owned: false },
            { id: "wg_blade", name: "Fanged Saber", icon: "GiCrescentBlade", owned: false },
            { id: "wg_chest", name: "Wolfhide Cuirass", icon: "GiChestArmor", owned: true, utilText: "" },
            { id: "wg_belt", name: "Fangbite Belt", icon: "GiBelt", owned: false },
            { id: "wg_boots", name: "Pathfinder Treads", icon: "GiLeatherBoot", owned: false },
            { id: "wg_axe", name: "Cleaver of the Moon", icon: "GiBattleAxe", owned: false },
        ],
        tiers: [
            { need: 2, active: true, text: "+10% Lucky Spin chance" },
            { need: 4, active: false, text: "+10% Lucky Spin chance" },
            { need: 6, active: false, text: "+12% Lucky Spin chance" },
        ],
        capstone: { desc: "Lucky Streak: a 12% chance each spin is FREE — your spin is refunded.", active: false },
        legend: [
            { label: "Lucky Spin", desc: "A chance each spin pays bonus gold on top of a gold prize." },
            { label: "Free respin", desc: "A chance a spin costs you nothing — your spin is handed back." },
        ],
    },
    {
        id: "harvester", name: "Harvester's Garb", total: 4, have: 1, collection: true,
        pieces: [
            { id: "harvesters_hat", name: "Harvester's Sun Hat", icon: "GiFarmer", owned: true, utilText: "🌱 +4 Grow speed" },
            { id: "reapers_girdle", name: "Reaper's Girdle", icon: "GiBelt", owned: false },
            { id: "sheafbound_cloak", name: "Sheafbound Cloak", icon: "GiCape", owned: false },
            { id: "amber_grain_pendant", name: "Amber Grain Pendant", icon: "GiNecklaceDisplay", owned: false },
        ],
        tiers: [
            { need: 2, active: false, text: "+4% Harvest luck" },
            { need: 4, active: false, text: "+6% Harvest luck · +8% Harvest gold" },
        ],
        capstone: { desc: "Bountiful Reaping: each harvest has a 20% chance to yield DOUBLE gold.", active: false },
        legend: [
            { label: "Harvest luck", desc: "Each point is 1% better harvest loot." },
            { label: "Harvest gold", desc: "Each point is 1% more harvest gold." },
            { label: "Grow speed", desc: "Each point is 1% faster crops." },
        ],
    },
];

// ── THE QUARTERMASTER ── the shop is a signed-in, doubloon-gated panel, so the only way to judge the manifest's
// slot rows at a phone width is against fixtures. Deliberately awkward again: the ten-piece set, one set one
// piece short, one already finished, and a locker line with NO sprite so the glyph fallback is visible.
const QM_LOCKER = [
    { id: "scroll_enchant", name: "Enchantment Scroll", price: 1000, icon: "GiScrollUnfurled", art: null,
        blurb: "Permanently adds an element of your choice to a piece of gear. Chest-only until now." },
    { id: "scroll_ancient", name: "Ancient Codex", price: 500, icon: "GiSpellBook", art: null,
        blurb: "2,000 XP on the spot. The only one in the game you can walk up and buy." },
    { id: "pot_fury", name: "Bottled Fury", price: 150, icon: "GiPotionBall", art: null,
        blurb: "Triple your daily strike damage for six hours. Save it for a boss you mean to hurt." },
    { id: "elixir_renewal", name: "Elixir of Renewal", price: 5000, icon: "GiHealthPotion", art: null,
        blurb: "Fully recharges an in-store perk you thought was spent. Real merchandise — priced like it." },
];
const qmPiece = (id, name, icon, rarity, owned) => ({ id, name, icon, rarity, owned, art: null });
const QM_SHOP = {
    piecePrice: 1000,
    gamble: { price: 250, table: [{ tier: "wooden", w: 56 }, { tier: "iron", w: 27 }, { tier: "gold", w: 13 }, { tier: "mythic", w: 4 }] },
    pieces: [
        {
            id: "founder", name: "Founder's Regalia", feature: "depths", have: 3, total: 4, done: false, price: 1000,
            capstone: "Cold Crucible: an 18% chance a smelt costs you no ore at all.",
            pieces: [
                qmPiece("fd_apron", "Founder's Scale Apron", "GiLeatherVest", "epic", true),
                qmPiece("fd_tongs", "Long Crucible Tongs", "GiPincers", "epic", true),
                qmPiece("fd_bellows_charm", "Bellows Charm", "GiWindHole", "rare", true),
                qmPiece("fd_slagsifter", "Slagsifter's Ring", "GiRing", "rare", false),
            ],
        },
        {
            id: "wheelwarden", name: "Wheelwarden's Fortune", feature: "wheel", have: 2, total: 10, done: false, price: 1000,
            capstone: "Lucky Streak: a 12% chance each spin is FREE — your spin is refunded.",
            pieces: [
                qmPiece("wg_helm", "Dire Wolf Helm", "GiWolfHead", "rare", true),
                qmPiece("wg_shield", "Wolfcrest Aegis", "GiShield", "rare", false),
                qmPiece("wg_ring", "Ironclaw Band", "GiClaws", "rare", false),
                qmPiece("wg_cloak", "Nightprowler Cloak", "GiCape", "rare", false),
                qmPiece("wg_amulet", "Wolf-Fang Amulet", "GiFangs", "rare", false),
                qmPiece("wg_blade", "Fanged Saber", "GiCrescentBlade", "rare", true),
                qmPiece("wg_chest", "Wolfhide Cuirass", "GiChestArmor", "rare", false),
                qmPiece("wg_belt", "Fangbite Belt", "GiBelt", "rare", false),
                qmPiece("wg_boots", "Prowler Boots", "GiLeatherBoot", "rare", false),
                qmPiece("wg_axe", "Moonhowl Axe", "GiBattleAxe", "rare", false),
            ],
        },
        {
            id: "harvester", name: "Harvester's Garb", feature: "farm", have: 4, total: 4, done: true, price: 1000,
            capstone: "Bountiful Reaping: each harvest has a 20% chance to yield DOUBLE gold.",
            pieces: [
                qmPiece("harvesters_hat", "Harvester's Sun Hat", "GiFarmer", "rare", true),
                qmPiece("reapers_girdle", "Reaper's Girdle", "GiRolledCloth", "rare", true),
                qmPiece("sheafbound_cloak", "Sheafbound Cloak", "GiCape", "epic", true),
                qmPiece("amber_grain_pendant", "Amber Grain Pendant", "GiAmberMosquito", "epic", true),
            ],
        },
    ],
};

export default function BoardsLab() {
    return (
        <div className="stack">
            <section className="card">
                <h1 style={{ margin: 0, fontSize: "1.3rem" }}>Boards lab</h1>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                    Dev only. The leaderboards and collection panels against fixtures, so a layout bug is visible
                    without a login or a database.
                </p>
            </section>

            <SailingBoards boards={{ fleet: FLEET, dig: DIG }} totals={{ fleet: 63, dig: 41 }}
                mePlace={{ dig: { place: 27, who: "The Wolf Den", avatar: face(1), points: 12, forged: 4 } }} />

            <section className="card">
                <div className="farm-loveboard-head">
                    <b>Most-loved farms</b>
                    <span>tier-weighted · like 1 · love 2 · admire 3</span>
                </div>
                <Leaderboard
                    rows={LOVE.map((r, i) => ({ ...r, value: r.score.toLocaleString(), unit: `love · ${r.votes} votes`,
                        href: r.you ? null : `/marketplace/farm?u=member${i}` }))}
                    total={47} unitPlural="farms"
                />
            </section>

            <section className="card sby">
                <div className="sby-head"><h3>Quartermaster</h3></div>
                <Quartermaster
                    shop={QM_SHOP} locker={QM_LOCKER} purse={2400} busy={false}
                    onBuyPiece={async (setId) => {
                        const s = QM_SHOP.pieces.find((x) => x.id === setId);
                        const p = s.pieces.find((x) => !x.owned) || s.pieces[0];
                        // Pretend the crate finished the set when it was the last one, so the biggest state
                        // the reveal has is reachable in the lab.
                        return { bought: { ...p, setName: s.name, set: s.id, have: s.have + 1, total: s.total,
                            completed: s.have + 1 >= s.total, capstone: s.have + 1 >= s.total ? s.capstone : null } };
                    }}
                    onGamble={async () => ({ won: { tier: "gold", label: "Gold chest", color: "#ffb648", image: null } })}
                />
            </section>

            <CollectionPanel sets={SETS} feature="wheel" title="Wheel collection"
                blurb="Won only from this wheel — the bonus is permanent and you never have to wear them." />
            <CollectionPanel sets={[SETS[1]]} feature="farm" title="Farm collections"
                blurb="Find the pieces anywhere in the Den — the bonus is permanent and you never have to wear them." />

            {/* Filler so the sticky game nav has something to scroll under. */}
            {Array.from({ length: 6 }).map((_, i) => (
                <section key={i} className="card"><p className="muted" style={{ margin: 0 }}>Scroll filler {i + 1}</p></section>
            ))}
        </div>
    );
}
