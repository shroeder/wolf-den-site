import Link from "next/link";

// ── THE GAME DOMAIN'S SHELL ──────────────────────────────────────────────────────────────────────────────────
// denquestonline.com gets its own layout, not the shop's.
//
// ⚠️ THE (public) LAYOUT MOUNTS NINETEEN COMPONENTS — announcement banner, presence heartbeat, push manager,
// gift and pet and recipe watchers, the social hub, the traffic beacon. Every one of them is right for a shop
// page and wrong wrapped around a game: they cover the viewport with prompts, and several poll the server on
// a timer, which on a page that already holds a 15 Hz socket open is a second conversation nobody asked for.
// A component mounted in a layout bills on every navigation by every member, forever.
//
// So this shell is a title bar and the game. Nothing watches anything.
export const metadata = {
    title: "Den Quest",
    description: "A small online world, played with your Wolf Den account.",
};

export default function DenQuestLayout({ children }) {
    return (
        <div style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            background: "#0c1316",
            color: "#dfece9",
        }}>
            <header style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 16px", borderBottom: "1px solid #1b2a2e",
                fontFamily: "ui-monospace, monospace", fontSize: 14,
            }}>
                <strong style={{ letterSpacing: ".08em", textTransform: "uppercase" }}>Den Quest</strong>
                <span style={{ flex: 1 }} />
                <Link href="https://www.wolfdengamingmn.com/marketplace"
                    style={{ color: "#7fd3c4", textDecoration: "none" }}>
                    The Wolf Den ↗
                </Link>
            </header>
            <main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                {children}
            </main>
        </div>
    );
}
