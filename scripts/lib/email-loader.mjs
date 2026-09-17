// ── READ THE APP'S REAL EMAILS WITHOUT SENDING ONE ───────────────────────────────────────────────────────────
// app-loader.mjs teaches plain `node` the app's own import rules; this adds the one more thing an email preview
// needs — `resend` resolves to a stub that KEEPS the message instead of delivering it. So the preview renders
// the real sender functions, with the real HTML, and nothing leaves the building.
//
// Why a loader instead of exporting the HTML builders: the senders are what production calls, and a preview
// that renders anything else is a preview of code no customer will ever receive. Seven of the first eight
// orders were pickups that got no email at all, which nobody caught because the emails had never been looked
// at — so the thing worth looking at is the sender, unmodified.
import { resolve as appResolve } from "./app-loader.mjs";

export async function resolve(specifier, context, next) {
    if (specifier === "resend") {
        return { url: new URL("./resend-capture.mjs", import.meta.url).href, shortCircuit: true };
    }
    return appResolve(specifier, context, next);
}
