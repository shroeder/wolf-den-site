import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// WHICH BUILD IS CURRENT. Read at request time, so it always answers for the deployment actually serving
// traffic — which is the whole point: a client compares it against the id baked into its own bundle to find
// out whether it is holding a stale build. See recoverFromStaleBuild in ChunkRecovery.
export async function GET() {
    return NextResponse.json(
        { id: process.env.VERCEL_DEPLOYMENT_ID || process.env.NEXT_PUBLIC_BUILD_ID || "dev" },
        { headers: { "Cache-Control": "no-store" } }
    );
}
