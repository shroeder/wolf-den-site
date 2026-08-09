import Link from "next/link";
import { REDEEM_KIND } from "@/lib/marketplace/redeem-link";

// The web fallback for a scanned redemption QR.
//
// On a staff phone this page should almost never be seen: the admin app claims
// https://www.wolfdengamingmn.com/r/* as a verified App Link, so Android hands the scan straight to the app
// and lands it on the redeem screen with the token already loaded. This is what everyone ELSE sees — a
// member who points their own camera at their code, a desktop browser, a phone without the app.
//
// It deliberately performs no action. The token is opaque and burning a charge needs an admin key, so the
// only useful thing this page can do is tell you who is supposed to be looking at it. Kept outside the
// (public) route group so a scan doesn't drag in the whole site chrome — this wants to be instant.

const KINDS = {
    [REDEEM_KIND.charge]: {
        title: "Perk code",
        lede: "Show this screen to a Wolf Den staff member — they'll scan it to use one charge on your item.",
        staff: "Staff: open the Wolf Den app, tap Redeem Perk, and scan the member's QR.",
    },
    [REDEEM_KIND.credit]: {
        title: "Store credit code",
        lede: "Show this screen at the counter — staff will scan it to spend your store credit.",
        staff: "Staff: open the Wolf Den app, go to Store Credit, and scan the member's QR.",
    },
};

export function generateMetadata() {
    // Never index a redemption code, and don't let it into a link preview.
    return { title: "Wolf Den — redemption code", robots: { index: false, follow: false } };
}

export default async function RedeemLandingPage({ params }) {
    const { kind, token } = await params;
    const meta = KINDS[kind];

    return (
        <main className="rdm">
            <div className="rdm-card">
                <span className="rdm-eyebrow">The Wolf Den</span>
                <h1>{meta ? meta.title : "Unknown code"}</h1>
                {meta ? (
                    <>
                        <p className="rdm-lede">{meta.lede}</p>
                        {/* The code itself, so staff can read it out if a scanner is being difficult. */}
                        <code className="rdm-token">{String(token || "").slice(0, 12)}…</code>
                        <p className="rdm-staff">{meta.staff}</p>
                    </>
                ) : (
                    <p className="rdm-lede">That link isn&apos;t a Wolf Den redemption code.</p>
                )}
                <Link className="rdm-home" href="/marketplace">Back to the Den</Link>
            </div>
            <style>{`
                .rdm { min-height: 100svh; display: grid; place-items: center; padding: 24px;
                    background: radial-gradient(120% 90% at 50% 0%, #1b1710 0%, #0c0b09 60%); }
                .rdm-card { width: min(420px, 100%); text-align: center; padding: 28px 22px 22px;
                    border: 1px solid #3a3222; border-radius: 16px; background: #14120e;
                    box-shadow: 0 18px 50px rgba(0,0,0,.55); }
                .rdm-eyebrow { display: block; font-size: 11px; letter-spacing: .18em; text-transform: uppercase;
                    color: #8a7c58; font-weight: 800; }
                .rdm h1 { margin: 8px 0 12px; font-size: 26px; font-weight: 900; color: #e6c76b; }
                .rdm-lede { margin: 0 0 16px; font-size: 15px; line-height: 1.5; color: #d8d2c4; }
                .rdm-token { display: inline-block; padding: 8px 14px; border-radius: 8px; font-size: 14px;
                    letter-spacing: .08em; color: #b6a97f; background: #0d0c09; border: 1px solid #2c2618; }
                .rdm-staff { margin: 18px 0 0; font-size: 13px; line-height: 1.5; color: #8f8875; }
                .rdm-home { display: inline-block; margin-top: 20px; font-size: 13px; font-weight: 700;
                    color: #e6c76b; text-decoration: none; }
            `}</style>
        </main>
    );
}
