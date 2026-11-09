import { redirect } from "next/navigation";

import { createBuyerSession, setBuyerSessionCookie } from "@/lib/marketplace/buyer-session.js";
import { redeemHandoffCode } from "@/lib/marketplace/denquest-handoff.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signing in | Den Quest", robots: { index: false, follow: false } };

// ── STEP 3 OF THE HANDOFF ────────────────────────────────────────────────────────────────────────────────────
// Reached on the GAME domain. Redeems the single-use code and writes a session cookie for THIS host, so from
// here on denquestonline.com knows who you are on its own.
//
// ⚠️ THE COOKIE IS HOST-ONLY AND THAT IS THE POINT. setBuyerSessionCookie writes no `domain` attribute, so the
// cookie belongs to whichever host served this request. Same code, same accounts table, two domains, and
// neither can read the other's cookie -- which is exactly the property that made the handoff necessary and is
// worth keeping.
//
// ⚠️ AND THE CODE IS NOT LEFT IN THE ADDRESS BAR. We redirect away immediately, so a spent code does not sit
// in history or get pasted into a chat with a screenshot.
export default async function EnterPage({ searchParams }) {
    const params = await searchParams;
    const code = typeof params?.c === "string" ? params.c : null;
    const buyerId = code ? await redeemHandoffCode(code) : null;

    if (!buyerId) {
        return (
            <div style={{ padding: "48px 20px", maxWidth: 560, margin: "0 auto" }}>
                <h1 style={{ marginBottom: 2 }}>That link has expired</h1>
                <p className="muted" style={{ marginTop: 0, maxWidth: "58ch" }}>
                    Sign-in links are good for twenty seconds and can only be used once. Start again from the
                    Wolf Den and you will be brought straight back.
                </p>
                <p>
                    <a className="pill" href="https://www.wolfdengamingmn.com/api/denquest/handoff">
                        Sign in with your Wolf Den account
                    </a>
                </p>
            </div>
        );
    }

    const { token } = await createBuyerSession(buyerId, { deviceLabel: "denquest" });
    await setBuyerSessionCookie(token);
    redirect("/");
}
