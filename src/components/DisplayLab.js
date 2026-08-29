// ── EVERY SURFACE THAT PRINTS AN ITEM, IN ONE PLACE ──────────────────────────────────────────────────────────
// Nine components each grew their own way of turning {stats} into words, and every one of them was written when
// might/crit/ferocity was the whole vocabulary. Damage, attack speed, armour, block chance, pierce, lifedrink,
// riposte, double strike, stun and haste all arrived afterwards, so most of these printed a weapon's own damage
// as "+24" — a bonus somebody granted you — a shield's block chance as "+0.44%", and anything the local map had
// never heard of as a raw database key.
//
// They all go through statParts/describeStats now. This mounts the REAL components, not copies of them, on
// fixture gear built to carry every new field at once, so the fix can be looked at rather than argued about.
import { ItemToggle } from "@/components/TradeBuilder";
import { CompareBlock } from "@/components/AuctionClient";
import { RevealStats, TOWN_CSS } from "@/components/TownClient";
import PublicGear from "@/components/PublicGear";
import { describeStats, itemById } from "@/lib/marketplace/items.js";

// A weapon, a shield and a chestpiece — between them every field that was missing, plus the six affixes.
const SWORD = { ...itemById("godsplitter"), stats: { ...itemById("godsplitter").stats, lifesteal: 4, stun: 8 } };
const SHIELD = { ...itemById("eternal_timeless_orb"), stats: { ...itemById("eternal_timeless_orb").stats, counter: 9, haste: 5 } };
const CHEST = itemById("ascendant_uplifted_vestment");

const INVENTORY = {
    equipped: { main_hand: SWORD.id, off_hand: SHIELD.id, chest: CHEST.id },
    items: [
        { id: SWORD.id, equipped: true }, { id: SHIELD.id, equipped: true }, { id: CHEST.id, equipped: true },
        { id: "worldender", equipped: false },
    ],
    // The totals panel: the piece's own numbers alongside the bonuses stacked on it.
    stats: { base_damage: 31, speed: 0.83, armor: 660, block_chance: 0.44, might: 99, vitality: 82,
        ferocity: 43, tenacity: 17, crit_chance: 50, crit_power: 54, pierce: 8, lifesteal: 3,
        counter: 7, stun: 8, haste: 5 },
};

const COMPARE = {
    equippedName: "Worldender", equippedEnhance: 4,
    diffs: [
        { key: "base_damage", label: "Damage", icon: "⚔️", delta: 6, text: "6" },
        { key: "block_chance", label: "Block Chance", icon: "🛡️", delta: 0.44, text: "44%" },
        { key: "speed", label: "Attack Speed", icon: "⏱️", delta: -0.11, text: "0.11/s" },
        { key: "pierce", label: "Pierce", icon: "🗡️", delta: -1, text: "1" },
    ],
    farmDiffs: [],
};

const Row = ({ title, note, children }) => (
    <section style={{ margin: "0 0 22px", padding: "14px 14px 16px", border: "1px solid #2c2a26", borderRadius: 12, background: "#151311" }}>
        <h2 style={{ margin: "0 0 2px", font: "800 0.82rem/1.2 system-ui", letterSpacing: ".08em", textTransform: "uppercase", color: "#ffb347" }}>{title}</h2>
        <p style={{ margin: "0 0 11px", font: "500 0.72rem/1.35 system-ui", color: "#8c857a" }}>{note}</p>
        {children}
    </section>
);

export default function DisplayLab() {
    return (
        <main style={{ maxWidth: 430, margin: "0 auto", padding: "16px 12px 60px", background: "#0d0c0b", minHeight: "100vh" }}>
            <Row title="Chest · mine · fishing · compendium · jeweller · sets" note="Five one-line renderers, all now describeStats(). Own numbers first, no plus; affixes after, with one.">
                <p style={{ font: "700 0.8rem/1.5 system-ui", color: "#e7dcc6", margin: 0 }}>{describeStats(SWORD.stats)}</p>
                <p style={{ font: "700 0.8rem/1.5 system-ui", color: "#e7dcc6", margin: "6px 0 0" }}>{describeStats(SHIELD.stats)}</p>
            </Row>

            <Row title="Town reveal chips" note="What you won, straight out of a glint or a chest. Gold chips are the piece itself.">
                {/* the town's own stylesheet, not a copy of it, so the chips look like they look in town */}
                <style>{TOWN_CSS}</style>
                <RevealStats item={{ stats: SHIELD.stats }} />
            </Row>

            <Row title="Trade builder card" note="Icon and value only — the piece's own numbers in gold so a weapon's damage does not read as a bonus.">
                <div style={{ display: "flex", gap: 8 }}>
                    <ItemToggle item={{ ...SWORD, enhanceLevel: 4 }} on={false} />
                    <ItemToggle item={SHIELD} on />
                </div>
            </Row>

            <Row title="Auction compare" note="A delta of a fraction is a percentage and a speed delta wears its /s — both were raw numbers before.">
                <CompareBlock c={COMPARE} />
            </Row>

            <Row title="Public profile gear" note="Somebody else's loadout and their combat total. The four own-numbers are orange; the twelve bonuses keep their plus.">
                <PublicGear inventory={INVENTORY} displayLabel="Hero" />
            </Row>
        </main>
    );
}
