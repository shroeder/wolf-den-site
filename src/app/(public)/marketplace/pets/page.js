import PetsClient from "@/components/PetsClient";
import ViewPing from "@/components/ViewPing";
import ConsumableShelf from "@/components/ConsumableShelf";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Pets | The Wolf Den",
    description: "Collect companions from leveling, the shop, achievements, rare chests, and boss drops. Every pet you own buffs your account; equip one for a stronger active buff.",
    alternates: { canonical: "/marketplace/pets" },
};

export default function PetsPage() {
    return (
        <>
            <ViewPing event="view_inventory" meta={{ section: "pets" }} />
            <PetsClient />
            {/* Every treat in the game feeds the pet on the screen above it. */}
            <ConsumableShelf feature="pets" title="Treats in your pack" />
        </>
    );
}
