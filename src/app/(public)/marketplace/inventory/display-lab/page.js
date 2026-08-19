import { notFound } from "next/navigation";

import DisplayLab from "@/components/DisplayLab";

// DEV ONLY. Every surface that prints an item's stats, side by side, on fixture gear chosen to carry ALL of the
// new fields at once — a weapon with damage and speed, a shield with armour and block chance, and the six
// affixes that did not exist when most of these renderers were written.
export const dynamic = "force-dynamic";
export const metadata = { title: "Display Lab", robots: { index: false, follow: false } };

export default function DisplayLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return <DisplayLab />;
}
