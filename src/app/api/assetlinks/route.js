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
                    sha256_cert_fingerprints: [
                        "B8:F3:43:65:FB:89:23:C6:DA:EC:EC:56:87:26:64:B7:FD:9B:59:5B:49:9A:6B:C4:C2:5C:E1:37:0B:CE:84:96",
                    ],
                },
            },
        ],
        { headers: { "content-type": "application/json" } }
    );
}
