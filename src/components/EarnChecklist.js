import Link from "next/link";

// The "How you earn" list — each row is a CTA linking to where you complete it, and (when signed in)
// shows your progress from getRewardsProgress(): one-time milestones read "Done ✓" in green, repeatable
// ones show their earned state. Shared by /marketplace/rewards and the profile hub.
// `repeatable` items can be earned again, so their "done" reads as an ongoing state, not a finish line.
export const EARN = [
    { key: "spend", icon: "🛒", label: "Every $1 spent", points: "+5 XP", note: "in-store & online", href: "/shop", cta: "Shop now →", doneNote: "You're earning on purchases", repeatable: true },
    { key: "first_purchase", icon: "⭐", label: "Your first purchase", points: "+100 XP", note: "one-time bonus", href: "/shop", cta: "Make a purchase →" },
    { key: "discord_link", icon: "💬", label: "Link your Discord", points: "+50 XP", note: "join the server", href: "/api/marketplace/discord/start", cta: "Link Discord →" },
    { key: "profile_complete", icon: "✅", label: "Complete your profile", points: "+25 XP", note: "name, handle, photo", href: "/marketplace/profile", cta: "Edit profile →" },
    { key: "first_message", icon: "✉️", label: "Send your first message", points: "+40 XP", note: "one-time bonus", href: "/marketplace/messages", cta: "Message the store →" },
    { key: "first_friend", icon: "🤝", label: "Make your first friend", points: "+40 XP", note: "one-time bonus", href: "/marketplace/friends", cta: "Find friends →" },
    { key: "first_wishlist", icon: "🔖", label: "Start your Looking For list", points: "+30 XP", note: "one-time bonus", href: "/looking-for", cta: "Add a card →" },
    { key: "first_equip", icon: "🎨", label: "Customize your look", points: "+20 XP", note: "equip a border or background", href: "/marketplace/profile", cta: "Customize →" },
    { key: "daily_active", icon: "🔥", label: "Daily visits & activity", points: "+XP", note: "come back often", href: "/shop", cta: "Keep it up →", doneNote: "Active today", repeatable: true },
];

export default function EarnChecklist({ progress = {}, signedIn = false }) {
    return (
        <ul className="mkt-earn-grid">
            {EARN.map((e) => {
                const done = signedIn && Boolean(progress[e.key]);
                return (
                    <li key={e.key}>
                        <Link href={e.href} className={`mkt-earn-item mkt-earn-cta${done ? " mkt-earn-done" : ""}`}>
                            <span className="mkt-earn-icon" aria-hidden="true">{done && !e.repeatable ? "✅" : e.icon}</span>
                            <span className="mkt-earn-body">
                                <span className="mkt-earn-label">{e.label}</span>
                                <span className="muted mkt-earn-note">{done ? (e.doneNote || "Completed ✓") : (signedIn ? e.cta : e.note)}</span>
                            </span>
                            <span className="mkt-earn-points">{done && !e.repeatable ? "Done" : e.points}</span>
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}
