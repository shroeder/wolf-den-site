import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-static";

// Digital Asset Links — lets our Android apps verify and claim wolfdengamingmn.com links so a tap (or a
// camera scan) opens the app instead of the browser. Served at /.well-known/assetlinks.json via a rewrite in
// next.config.mjs (Next drops dot-folders in public/, so a route is the reliable way to serve it).
//
//   com.wolf_den_market          → /marketplace/messages, so message notifications land in the app
//   com.wolfdenledger(.employee) → /r/*, so scanning a member's perk / store-credit QR with ANY camera opens
//                                  the admin app on the redeem screen instead of showing raw text
//
// Both admin flavors are side-loaded (self-update from Vercel Blob, never Play), so the debug keystore is
// the only cert that ever signs them.
const DEBUG_KEYSTORE = "B8:F3:43:65:FB:89:23:C6:DA:EC:EC:56:87:26:64:B7:FD:9B:59:5B:49:9A:6B:C4:C2:5C:E1:37:0B:CE:84:96";

const admin = (packageName) => ({
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: [DEBUG_KEYSTORE] },
});

export function GET() {
    return NextResponse.json(
        [
            {
                relation: ["delegate_permission/common.handle_all_urls"],
                target: {
                    namespace: "android_app",
                    package_name: "com.wolf_den_market",
                    // Two certs on purpose: Play re-signs the store build with Google's app signing
                    // key, while side-loaded `publish:market` builds keep the debug cert.
                    sha256_cert_fingerprints: [
                        // Play app signing key (store builds)
                        "73:0D:7B:3C:50:A7:DC:21:86:B8:54:20:42:0E:58:DD:C3:24:E0:4A:1B:57:9E:CB:DB:C1:A3:26:21:3F:7A:86",
                        // Debug keystore (side-loaded builds)
                        DEBUG_KEYSTORE,
                    ],
                },
            },
            admin("com.wolfdenledger"),
            admin("com.wolfdenledger.employee"),
        ],
        { headers: { "content-type": "application/json" } }
    );
}
