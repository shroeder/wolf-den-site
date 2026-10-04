import TownClient from "@/components/TownClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { db } from "@/lib/db";
import { halloweenOn } from "@/lib/marketplace/owner.js";
import { getTownState } from "@/lib/marketplace/town.js";
import { HALLOWEEN_PUBLIC } from "@/lib/marketplace/halloween.js";
import { IDLE_LINES, GREET_LINES, BUY_LINES, BROKE_LINES, OWNED_LINES } from "@/lib/marketplace/gourdfather.js";
import { DOORS, knockedToday } from "@/lib/marketplace/trick-or-treat.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Wolf Den Town | The Wolf Den", robots: { index: false } };

// The persistent social overworld — LIVE for all signed-in members. Logged-out visitors get a sign-in nudge.
export default async function TownPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) {
        return (
            <div className="stack" style={{ maxWidth: 720, margin: "0 auto", padding: "0 12px" }}>
                <section className="card" style={{ textAlign: "center", padding: 28 }}>
                    <h1 style={{ marginTop: 0 }}>🏘️ Wolf Den Town</h1>
                    <p className="muted">Gather with the pack, see what everyone&apos;s up to, and hang out. Sign in to enter the plaza.</p>
                </section>
            </div>
        );
    }
    const initial = await getTownState(buyer.id).catch(() => null);
    // ── THE HALLOWE'EN FLAG ──────────────────────────────────────────────────────────────────────────────
    // One question, answered on the server — never a client check, or the whole plaza gets the seasonal art
    // the moment somebody sets a localStorage key by hand. Answered HERE rather than fetched after mount so
    // the plaza renders dressed on the FIRST paint; the old version showed a lit daytime town for a frame and
    // then dropped the sun, on every visit.
    const hw = halloweenOn(buyer.id);
    // ── THE GOURDFATHER'S SCRIPT, HANDED DOWN ────────────────────────────────────────────────────────────
    // His module is `server-only` because it reads the database, so the client cannot import his lines — it
    // would drag the whole thing into the bundle and fail the build. Passing them as props also means his
    // mouth and his prices can never disagree about whether the event is on: both come from the same render.
    //
    // Only when the event is actually up. With it down this is `null` and the plaza has never heard of him.
    const gourd = hw
        ? {
            idle: IDLE_LINES,
            greet: GREET_LINES,
            buy: BUY_LINES,
            broke: BROKE_LINES,
            owned: OWNED_LINES,
            doors: Object.entries(DOORS).map(([id, d]) => ({ id, label: d.label })),
            // ⚠️ WHICH DOORS ARE SPENT, ON THE FIRST PAINT. The plaza draws a pail on every porch; fetching
            // this after mount means painting eighteen full ones and then emptying six a beat later, which
            // reads as the night resetting itself. One indexed read on a page that is already dynamic.
            knocked: await knockedToday(buyer.id).catch(() => []),
        }
        : null;
    return (
        <div className="stack" style={{ maxWidth: 820, margin: "0 auto", padding: "0 12px" }}>
            <TownClient initial={initial} halloween={hw} gourd={gourd} />
        </div>
    );
}
