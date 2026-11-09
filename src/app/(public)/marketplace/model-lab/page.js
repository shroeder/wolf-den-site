import { redirect } from "next/navigation";

import ModelLab from "@/components/ModelLab.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { isOwner } from "@/lib/marketplace/owner.js";

// ── THE 3D MODEL LAB ─────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ OWNER-GATED, NOT DEV-ONLY. Every other lab in here 404s outside development, because a lab is a tool for
// tuning game feel on a machine with the repo on it. This one is different on purpose: the whole point is that
// Luke can open it on his phone or any browser and watch the walk cycle run, which a `NODE_ENV` check makes
// impossible. So it is gated on ownership instead and carries robots: noindex.
export const dynamic = "force-dynamic";
export const metadata = {
    title: "Model Lab | Wolf Den",
    robots: { index: false, follow: false },
};

export default async function ModelLabPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer || !isOwner(buyer.id)) redirect("/marketplace");

    return (
        <div className="stack">
            <h1 style={{ marginBottom: 2 }}>Model Lab</h1>
            <p className="muted" style={{ marginTop: 0, maxWidth: "62ch" }}>
                The low-poly set. Flat-shaded, a few hundred triangles each, every colour out of one
                palette. Built by <code>npm run lp:done</code> in Blender; this page reads the manifest
                that build writes, so what is listed here is exactly what shipped.
            </p>
            <ModelLab />
        </div>
    );
}
