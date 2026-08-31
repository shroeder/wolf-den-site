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
const IDLE_URL = `${SITE_URL}/?utm_source=pos&utm_medium=qr&utm_campaign=counter-screen`;

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
