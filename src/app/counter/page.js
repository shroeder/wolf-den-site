import QRCode from "qrcode";

import CounterDisplayClient from "@/components/CounterDisplayClient";
import { POS_PITCH, posDisplayConfigured, posDisplayKeyOk } from "@/lib/marketplace/pos-display.js";
import { publicWheelView } from "@/lib/marketplace/spin.js";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = {
    title: "Wolf Den — counter",
    robots: { index: false, follow: false },
};

// ── THE SCREEN THAT FACES THE CUSTOMER ───────────────────────────────────────────────────────────────────────
// Park a browser on /counter?key=<POS_DISPLAY_KEY>, full screen, and leave it. It shows a prize wheel anybody
// can spin until a sale lands, then that sale's QR for a couple of minutes, then goes back to the wheel.
// Nobody touches it (except the customers, which is the point).
//
// The key is in the URL rather than a login because the machine is unattended and customer-facing — a signed-in
// staff session sitting on a screen the public can see is the thing this avoids. See pos-display.js.
//
// ── THE IDLE QR IS TAGGED, AND IT IS THE ONLY TAGGED QR WE HAVE ──────────────────────────────────────────────
// Every scan in the Den's history has been indistinguishable from somebody typing the URL: 3,055 of 3,722
// visitors are `direct`. mkt_visitor already stores utm_source/medium/campaign and back-fills buyer_id the
// moment that visitor signs in, so tagging this one link makes the whole screen measurable — how many people
// scanned it, and how many of those became members — with no new schema at all.
// ── AND IT LANDS ON THE WHEEL ────────────────────────────────────────────────────────────────────────────────
// Luke: "the QR code lets them register and then they can go to the wheel like anybody else who's already
// registered... we would just need to make sure that the onboarding ramp from QR code sign up to the wheel is
// pretty easy because otherwise it's going to be overwhelming for new users to try and navigate and figure out
// where the menu is and get to the right place."
//
// That ramp is now the whole screen: they spin the wheel here, and the code takes them to the same wheel with
// an account behind it. Nothing about the destination changed when the slideshow went — every account already
// gets a free spin every day, so a brand-new member has one waiting and so does the member who joined a year
// ago and never found it.
//
// `signup=1` opens on the CREATE form rather than the sign-in form, because somebody scanning a QR code off a
// shop counter does not have an account yet — and the sign-in link is right there for the ones who do.
const IDLE_URL = `${SITE_URL}/marketplace/login?signup=1&returnTo=${encodeURIComponent("/marketplace/spin")}`
    + `&utm_source=pos&utm_medium=qr&utm_campaign=counter-screen`;

export default async function CounterPage({ searchParams }) {
    const { key } = await searchParams;

    if (!posDisplayKeyOk(key)) {
        return (
            <div className="pos pos-shut">
                <b>Counter display</b>
                <p>
                    {posDisplayConfigured()
                        ? "Wrong key for this screen."
                        : "POS_DISPLAY_KEY is not set on the server, so this screen is closed."}
                </p>
            </div>
        );
    }

    // Both of these are static for the life of the screen, so they are resolved once here rather than fetched
    // on the poll: the QR needs the encoder, and the wheel is a module-level table. Only the claim rides the
    // poll, because only the claim changes.
    const signupQr = await QRCode.toDataURL(IDLE_URL, {
        width: 720, margin: 1, errorCorrectionLevel: "M",
        color: { dark: "#101014", light: "#ffffff" },
    }).catch(() => null);

    return (
        <CounterDisplayClient
            displayKey={String(key)}
            signupQr={signupQr}
            wheel={publicWheelView()}
            pointsRate={POS_PITCH.rate}
            claimBase={`${SITE_URL}/marketplace/claim/`}
        />
    );
}
