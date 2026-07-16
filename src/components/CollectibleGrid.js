import { collectiblesForLevel } from "@/lib/marketplace/collectibles.js";

// The member's collection: a grid of unlockable vector items (game-icons). Unlocked ones show in color;
// locked ones are dimmed with their unlock level. Presentational; unlock state is level-derived.
export default function CollectibleGrid({ level = 1, unlockAll = false }) {
    const items = collectiblesForLevel(level, { unlockAll });
    const unlocked = items.filter((i) => i.unlocked).length;
    return (
        <div>
            <p className="collectible-count muted">🗃️ {unlocked} / {items.length} collected</p>
            <div className="collectible-grid">
                {items.map((c) => {
                    const Icon = c.Icon;
                    return (
                        <div
                            key={c.id}
                            className={`collectible rar-${c.rarity} ${c.unlocked ? "is-unlocked" : "is-locked"}`}
                            title={c.unlocked ? `${c.name} — ${c.hint}` : `${c.name} · unlocks at Level ${c.level}`}
                        >
                            <span className="collectible-icon" style={c.unlocked ? { color: c.color } : undefined}>
                                <Icon aria-hidden="true" />
                            </span>
                            <span className="collectible-name">{c.unlocked ? c.name : `Lv ${c.level}`}</span>
                        </div>
                    );
                })}
            </div>
            <p className="collectible-credit muted">
                Item art by <a href="https://game-icons.net" target="_blank" rel="noreferrer">game-icons.net</a> (CC BY 3.0)
            </p>
        </div>
    );
}
