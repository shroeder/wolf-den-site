import { notFound } from "next/navigation";

import ExpeditionLab from "@/components/ExpeditionLab";

export const dynamic = "force-dynamic";
export const metadata = { title: "Expedition lab", robots: { index: false, follow: false } };

// ⚠️ DEV ONLY, AND NOT OWNER-GATED — GATED ON THE BUILD ITSELF. An owner gate would still ship this route to
// production; NODE_ENV is the only check that guarantees the fixture lab cannot exist on the live site. Same
// contract as the arena lab. See [[visual-rigs]] and [[no-public-facing-tests]].
export default async function ExpeditionLabPage({ searchParams }) {
    if (process.env.NODE_ENV !== "development") notFound();
    const sp = await searchParams;
    return (
        <main className="wrap" style={{ paddingTop: 8, paddingBottom: 28 }}>
            <ExpeditionLab scene={sp?.scene || "plot3"} chrome={sp?.chrome !== "0"} />
        </main>
    );
}
