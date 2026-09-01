import { notFound } from "next/navigation";

import SocialLab from "@/components/SocialLab";

// DEV ONLY — see SocialLab.js. Mounts the real hub against a stubbed fetch so the tab chrome can be shot at
// phone width without a session. Every other build 404s.
export const dynamic = "force-dynamic";
export const metadata = { title: "Social Lab", robots: { index: false, follow: false } };

export default function Page() {
    if (process.env.NODE_ENV === "production") notFound();
    return <SocialLab />;
}
