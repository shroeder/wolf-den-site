// The shape of a scannable redemption code.
//
// These used to be encoded as bare text ("WDCHG:<token>"), which meant a phone's camera app had nothing to
// route — it could only display the string. Staff had to know to open the admin app first and use its
// built-in scanner. Encoding an https URL instead makes the QR work the way people expect: the camera sees a
// link, Android App Links hands it to the admin app (verified via /.well-known/assetlinks.json), and the app
// lands directly on the redeem screen with the token already in hand. Anyone without the app just gets a
// harmless web page telling them to show the code to staff.
//
// The old "WDCHG:"/"WDCRD:" prefixes are still parsed by the app's scanner, so codes minted before this
// change (and any printed elsewhere) keep working.
export const REDEEM_ORIGIN = "https://www.wolfdengamingmn.com";

/** Path segment per code type. Short on purpose — it lands in the QR, and denser QRs scan worse. */
export const REDEEM_KIND = {
    charge: "chg", // an item's in-store perk charge
    credit: "crd", // store credit spent at the register
};

/**
 * Absolute URL to encode into a QR. Always the canonical host: App Links only verify against the exact
 * host listed in assetlinks.json, so a preview deployment must still mint www links or the scan won't route.
 */
export function redeemUrl(kind, token) {
    const seg = REDEEM_KIND[kind];
    if (!seg || !token) return "";
    return `${REDEEM_ORIGIN}/r/${seg}/${encodeURIComponent(token)}`;
}
