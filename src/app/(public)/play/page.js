import PlayLanding from "@/components/PlayLanding";
import { getGamePitch } from "@/lib/marketplace/game-pitch.js";

// ── THE SIGN-UP PAGE ────────────────────────────────────────────────────────────────────────────────────────
// Luke: "I really need to convert visits to game sign ups."
//
// ⚠️ IT IS DELIBERATELY NOT PERSONALISED, AND THAT IS A COST DECISION. Reading the session to bounce members
// straight into the game would make this page dynamic, and dynamic means every visitor arriving from one
// shared post pays for four database queries and a render. This is the page most likely to be hit by a
// crowd all at once, so it is rendered ONCE every ten minutes and served to everybody. See the Active CPU
// note in CLAUDE.md: round trips are the meter that bills.
//
// A member who lands here loses nothing: the button goes to the login route, which already knows who they
// are and sends them on. The funnel self-heals rather than being hand-held at the cost of the whole cache.
//
// Ten minutes is matched to the data: the prize wall changes about once a week and the member count drifts
// slowly, so a visitor is never looking at anything meaningfully stale.
export const revalidate = 600;

export const metadata = {
    title: "Play the Wolf Den game — free, in your browser",
    description:
        "A free browser game run out of a Minnesota card shop. Hunt the Grove, sail a fleet, forge gear, and win real trading cards off the weekly boss. Create a character in a minute.",
    alternates: { canonical: "/play" },
    openGraph: {
        title: "There is a whole game inside the card shop",
        description:
            "Free to play in your browser. Nine worlds, a weekly boss, and real card prizes handed out in store.",
        url: "/play",
    },
};

export default async function PlayPage() {
    // Never let a database hiccup turn the sign-up page into an error page: the pitch, the worlds and all
    // three calls to action render perfectly well with no prizes to show.
    const pitch = await getGamePitch().catch(() => ({ winners: [], prize: null, stats: {} }));
    return <PlayLanding pitch={pitch} />;
}
