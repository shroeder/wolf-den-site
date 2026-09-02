import QRCode from "qrcode";

import CounterDisplayClient from "@/components/CounterDisplayClient";
import { bossPrizes, chargedGearArt, chargedGearPitch, posCollage, shelfPrize, POS_PITCH, posDisplayConfigured, posDisplayKeyOk } from "@/lib/marketplace/pos-display.js";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = {
    title: "Wolf Den — counter",
    robots: { index: false, follow: false },
};

// ── THE SCREEN THAT FACES THE CUSTOMER ───────────────────────────────────────────────────────────────────────
// Park a browser on /counter?key=<POS_DISPLAY_KEY>, full screen, and leave it. It shows the pitch until a sale
// lands, then that sale's QR for a couple of minutes, then goes back to the pitch. Nobody touches it.
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
// It used to land on the site's front page, which is a shop window: a new member then had to find sign-up,
// get through it, and then go hunting through a game menu for a wheel nobody had told them about. Three
// guesses in a row, at a counter, with somebody waiting behind them.
//
// Now it opens the sign-up form directly and comes back to the wheel the moment the account is live. Nothing
// about the wheel changes — every account already gets a free spin every day, so a brand-new member has one
// waiting and so does the member who joined a year ago and never found it. That is the whole offer, and it
// needed no new mechanic, only a door.
//
// `signup=1` opens on the CREATE form rather than the sign-in form, because somebody scanning a QR code off a
// shop counter does not have an account yet — and the sign-in link is right there for the ones who do.
const IDLE_URL = `${SITE_URL}/marketplace/login?signup=1&returnTo=${encodeURIComponent("/marketplace/spin")}`
    + `&utm_source=pos&utm_medium=qr&utm_campaign=counter-screen`;

export default async function CounterPage({ searchParams }) {
    const { key, slide } = await searchParams;

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

    // The QR and the collage are the two things the client cannot build for itself: one needs the qrcode
    // encoder, the other needs four database tables. Both are effectively static for the life of the screen,
    // so they are resolved once here rather than fetched on the poll. The mystery board is the exception and
    // rides the poll, because it changes when a bag is sold.
    const [idleQr, collage, prizes, gearArt, shelf] = await Promise.all([
        QRCode.toDataURL(IDLE_URL, {
            width: 720, margin: 1, errorCorrectionLevel: "M",
            color: { dark: "#101014", light: "#ffffff" },
        }).catch(() => null),
        posCollage().catch(() => []),
        bossPrizes().catch(() => ({ given: [], upNext: null })),
        chargedGearArt().catch(() => ({})),
        shelfPrize().catch(() => null),
    ]);

    // ?slide=world|prizes|gear|mystery|loop pins one panel instead of rotating — park it on the mystery
    // board during a bag drop, or on the prizes the week a boss is up. No param and it cycles.
    return (
        <CounterDisplayClient
            displayKey={String(key)}
            idleQr={idleQr}
            pitch={POS_PITCH}
            gear={chargedGearPitch()}
            gearArt={gearArt}
            shelf={shelf}
            collage={collage}
            prizes={prizes}
            pinned={typeof slide === "string" ? slide : null}
            claimBase={`${SITE_URL}/marketplace/claim/`}
        />
    );
}
