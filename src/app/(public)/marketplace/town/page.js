import TownClient from "@/components/TownClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { db } from "@/lib/db";
import { halloweenOn } from "@/lib/marketplace/owner.js";
import { getTownState } from "@/lib/marketplace/town.js";
import { groveOpen } from "@/lib/marketplace/grove.js";
import { HALLOWEEN_PUBLIC } from "@/lib/marketplace/halloween.js";
import { IDLE_LINES, GREET_LINES, BUY_LINES, BROKE_LINES, OWNED_LINES } from "@/lib/marketplace/gourdfather.js";
import { DOORS, knockedToday, snatcherDoors } from "@/lib/marketplace/trick-or-treat.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Wolf Den Town | The Wolf Den", robots: { index: false } };

// The persistent social overworld — LIVE for all signed-in members. Logged-out visitors get a sign-in nudge.
export default async function TownPage({ searchParams }) {
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
    // ?town=N — owner-only, so the seven towns can be looked at before gating is live. See getTownState.
    const sp = await searchParams;
    const initial = await getTownState(buyer.id, { previewTown: sp?.town || null }).catch(() => null);
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
            // ⚠️ AND WHICH PAIL IS KICKING, ON THE FIRST PAINT FOR THE SAME REASON. The legs have to be
            // there when the street appears — a bucket that grows a skeleton fifteen seconds after you
            // walked past it has been missed by everyone who was already looking at it. Costs nothing: it
            // is a hash of (you, door, tonight), not a query. Almost always [].
            legs: await snatcherDoors(buyer.id).catch(() => []),
        }
        : null;
    return (
        <div className="stack" style={{ maxWidth: 820, margin: "0 auto", padding: "0 12px" }}>
            {/* ── ⚠️ THE WAY BACK INTO THE GROVE, BECAUSE THERE WAS NONE ─────────────────────────────
                Luke: "if you go to town, you completely get booted out of the Grove. Like, the whole
                experience is lost. You have to go all the way back into the menu to find the Grove
                again. And I don't like that."

                He is describing a real dead end. The Grove sends people here from two places -- the
                town button in a zone and dying -- and both are hard navigations into a page that had
                no route back. The only way home was the site's own menu, several taps away, on a
                strip the Grove deliberately hides while you are in it.

                ⚠️ THIS IS THE PRAGMATIC HALF AND NOT THE WHOLE ASK. What he actually wants is Town
                rendered as another Grove zone with the Grove's own menu down the left -- "still in
                that experience". TownClient is a full-screen social overworld with its own camera,
                polling and state, so mounting it inside the Grove shell is a real piece of work and
                wants its own pass. A door is not that. A door is the bleeding stopped.

                ⚠️ ON THE PAGE, NOT IN TownClient. The page is a server component that already holds
                the buyer, so the access check is free here and the 4,000-line client is untouched.

                ⚠️ AND ONLY FOR PEOPLE WHO CAN ACTUALLY GO. groveOpen is the same gate the Grove
                itself uses -- a door to a room you are not allowed into is worse than no door. */}
            {groveOpen(buyer.id) ? (
                <a href="/marketplace/grove" className="tw-grove-door" aria-label="Back to the Grove">
                    {/* The real nav sprite, not a glyph: this is a destination. */}
                    <img src="/images/nav/grove.png" alt="" width={30} height={30} aria-hidden="true" />
                    <span>The Grove</span>
                </a>
            ) : null}
            <TownClient initial={initial} halloween={hw} gourd={gourd} />
        </div>
    );
}
