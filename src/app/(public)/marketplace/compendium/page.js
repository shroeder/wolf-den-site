import CompendiumClient from "@/components/CompendiumClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "The Compendium · The Wolf Den" };

// Every item in the game and whether you have ever held one. The client fetches its own data because the
// catalogue is the same for everybody and only the collected set is personal — one no-store GET, no props.
export default function CompendiumPage() {
    return <CompendiumClient />;
}
