"use client";

import CollectionPanel from "@/components/CollectionPanel";
import Leaderboard from "@/components/Leaderboard";
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
            { id: "wg_amulet", name: "Moonlit Amulet", icon: "GiAmulet", owned: false },
            { id: "wg_blade", name: "Fanged Saber", icon: "GiSabre", owned: false },
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
            { id: "amber_grain_pendant", name: "Amber Grain Pendant", icon: "GiAmulet", owned: false },
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
                    rows={LOVE.map((r) => ({ ...r, value: r.score.toLocaleString(), unit: `love · ${r.votes} votes` }))}
                    total={47} unitPlural="farms"
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
