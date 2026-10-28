import CompendiumClient from "@/components/CompendiumClient";
import { gatePage } from "@/lib/marketplace/gate-page.js";
import ViewPing from "@/components/ViewPing";

export const dynamic = "force-dynamic";
export const metadata = { title: "The Compendium · The Wolf Den" };

// Every item in the game and whether you have ever held one. The client fetches its own data because the
// catalogue is the same for everybody and only the collected set is personal — one no-store GET, no props.
export default async function CompendiumPage() {
    // The town gate's route half — see gate-page.js. One line, and it is the half that gets forgotten.
    await gatePage("compendium");
    return (
        <>
            <ViewPing event="view_compendium" />
            <CompendiumClient />
        </>
    );
}
