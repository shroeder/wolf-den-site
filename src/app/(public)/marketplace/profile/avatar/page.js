import Link from "next/link";
import { redirect } from "next/navigation";

import AvatarBuilder from "@/components/AvatarBuilder";
import AvatarCosmeticsPicker from "@/components/AvatarCosmeticsPicker";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getProfile } from "@/lib/marketplace/profile.js";
import { getStoreState } from "@/lib/marketplace/store.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Edit Your Avatar | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

// The full avatar studio (moved off the profile so it doesn't bury everything else).
export default async function AvatarStudioPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) redirect("/marketplace/login?returnTo=/marketplace/profile/avatar");

    const [profile, store] = await Promise.all([
        getProfile(buyer.id).catch(() => null),
        getStoreState(buyer.id).catch(() => ({ gold: 0, purchased: { pet: [], border: [], frame: [], cosmetic: [] } })),
    ]);
    const level = profile?.level || null;
    const isStaff = (profile?.badges || []).some((b) => ["owner", "site_admin", "staff"].includes(b.slug));

    return (
        <div className="stack reveal">
            <Link href="/marketplace/profile" className="text-link">← Back to profile</Link>

            <section className="card">
                <h1 style={{ marginTop: 0 }}>Your avatar</h1>
                <p className="muted" style={{ marginTop: 0 }}>Full control of your character — skin, hair &amp; hats, face, beard, outfit &amp; graphics, glasses, and every color.</p>
                <AvatarBuilder current={profile?.avatarConfig} />
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Avatar cosmetics</h2>
                <p className="muted" style={{ marginTop: 0 }}>An aura glow you unlock as you level up — a soft light behind your avatar. Tap to equip; tap again to remove.</p>
                <AvatarCosmeticsPicker
                    avatarConfig={profile?.avatarConfig}
                    initial={(profile?.displayLabel || "?").slice(0, 1).toUpperCase()}
                    level={level?.level || 1}
                    unlockAll={isStaff}
                    badges={(profile?.badges || []).map((b) => b.slug)}
                    current={profile?.avatarCosmetics || {}}
                    owned={store.purchased.cosmetic}
                    gold={store.gold}
                />
            </section>
        </div>
    );
}
