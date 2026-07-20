// BOSS WEAKNESSES — each weekly boss is vulnerable to a certain playstyle, so the "best" loadout changes
// week to week (pairs with the signature archetypes). Pure module (no db); combat + display both read it.

export const WEAKNESSES = {
    exposed: { key: "exposed", label: "Exposed", emoji: "🎯", desc: "Takes +40% from your CRITICAL hits.", bonus: 0.4 },
    sluggish: { key: "sluggish", label: "Sluggish", emoji: "🗿", desc: "Takes +50% from your FIRST strike each day.", bonus: 0.5 },
    frail: { key: "frail", label: "Frail", emoji: "🩸", desc: "Takes +40% while below half HP — finishers thrive.", bonus: 0.4 },
    beast_cursed: { key: "beast_cursed", label: "Beast-cursed", emoji: "🐾", desc: "Your equipped PET tears in for +50%.", bonus: 0.5 },
    hunted: { key: "hunted", label: "Hunted", emoji: "🐺", desc: "Takes +5% for every ally who's hit it today (up to +40%).", per: 0.05, cap: 0.4 },
    unstable: { key: "unstable", label: "Unstable", emoji: "⚡", desc: "ERUPT & OVERCHARGE procs deal +50%.", bonus: 0.5 },
};

export const WEAKNESS_KEYS = Object.keys(WEAKNESSES);
export function pickWeakness(rand = Math.random) {
    return WEAKNESS_KEYS[Math.floor(rand() * WEAKNESS_KEYS.length)];
}
export function weaknessInfo(key) {
    const w = WEAKNESSES[key];
    return w ? { key: w.key, label: w.label, emoji: w.emoji, desc: w.desc } : null;
}

// The damage multiplier for a single hit, given the boss's weakness + hit context (≥1).
export function weaknessMult(key, { crit = false, firstHit = false, bossHpFrac = 1, hasPet = false, hittersToday = 1, burstProc = false } = {}) {
    const w = WEAKNESSES[key];
    if (!w) return 1;
    switch (key) {
        case "exposed": return crit ? 1 + w.bonus : 1;
        case "sluggish": return firstHit ? 1 + w.bonus : 1;
        case "frail": return bossHpFrac <= 0.5 ? 1 + w.bonus : 1;
        case "beast_cursed": return hasPet ? 1 + w.bonus : 1;
        case "hunted": return 1 + Math.min(w.cap, w.per * Math.max(0, hittersToday - 1));
        case "unstable": return burstProc ? 1 + w.bonus : 1;
        default: return 1;
    }
}
