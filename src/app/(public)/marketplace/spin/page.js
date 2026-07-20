import Link from "next/link";

import SpinWheel from "@/components/SpinWheel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily Spin · The Wolf Den" };

export default function SpinPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0 }}>🎡 Daily Spin</h1>
                <p className="muted" style={{ marginTop: 0 }}>
                    One free spin every day for gold, XP, treats, chests, pets, and jackpots. <Link href="/marketplace/quests" className="pill">📜 Quests</Link> <Link href="/marketplace/boss" className="pill">⚔️ Boss</Link>
                </p>
            </section>
            <SpinWheel />
        </div>
    );
}
