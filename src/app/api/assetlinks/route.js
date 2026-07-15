import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-static";

// Digital Asset Links — lets the marketplace Android app (com.wolf_den_market) verify and claim
// https://www.wolfdengamingmn.com/marketplace/messages links so message notifications open the app
// instead of the browser. Served at /.well-known/assetlinks.json via a rewrite in next.config.mjs
// (Next drops dot-folders in public/, so a route is the reliable way to serve it).
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
                        "B8:F3:43:65:FB:89:23:C6:DA:EC:EC:56:87:26:64:B7:FD:9B:59:5B:49:9A:6B:C4:C2:5C:E1:37:0B:CE:84:96",
                    ],
                },
            },
        ],
        { headers: { "content-type": "application/json" } }
    );
}
