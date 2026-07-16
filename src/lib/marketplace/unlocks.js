// Lightweight, level-driven unlock lookups from the PURE catalogs (ranks/borders/backgrounds/frames/
// avatar-cosmetics/perks). Deliberately does NOT touch the DB or the react-icons collectibles, so it's
// cheap to call in hot paths (the site-wide nudge endpoint + the XP-award level-up push). Role-gated and
// "coming soon" entries are excluded — these are things you actually unlock by leveling.
import { AVATAR_COSMETICS } from "@/lib/marketplace/avatar-cosmetics.js";
import { BACKGROUNDS } from "@/lib/marketplace/backgrounds.js";
import { BORDERS } from "@/lib/marketplace/borders.js";
import { FRAMES } from "@/lib/marketplace/frames.js";
import { LEVEL_PERKS, RANKS } from "@/lib/marketplace/ranks.js";

// Every level-gated unlock as { level, icon, label }.
function allUnlocks() {
    const out = [];
    RANKS.forEach((r) => { if (r.level > 1) out.push({ level: r.level, icon: r.emoji, label: `${r.title} rank` }); });
    BORDERS.filter((b) => b.id !== "none" && !b.requiresBadges).forEach((b) => out.push({ level: b.level, icon: b.icon, label: `${b.label} border` }));
    BACKGROUNDS.filter((b) => b.id !== "none").forEach((b) => out.push({ level: b.level, icon: b.icon, label: `${b.label} background` }));
    FRAMES.filter((f) => f.id !== "none" && !f.requiresBadges).forEach((f) => out.push({ level: f.level, icon: f.icon, label: `${f.label} frame` }));
    AVATAR_COSMETICS.filter((c) => !c.requiresBadges).forEach((c) => out.push({ level: c.level, icon: c.icon, label: c.label }));
    LEVEL_PERKS.filter((p) => !p.soon).forEach((p) => out.push({ level: p.level, icon: p.icon, label: p.label }));
    return out;
}

// The next thing a member will unlock above their current level (or null if none remain in these catalogs).
export function nextUnlock(level) {
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    const ahead = allUnlocks().filter((u) => u.level > lvl).sort((a, b) => a.level - b.level);
    return ahead[0] || null;
}

// Labels (with icon) of everything unlocked exactly at `level` — for the "you unlocked X" level-up push.
export function unlocksAtLevel(level) {
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    return allUnlocks().filter((u) => u.level === lvl).map((u) => `${u.icon} ${u.label}`);
}
