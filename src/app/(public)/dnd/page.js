import DndSurveyClient from "@/components/DndSurveyClient";

export const metadata = {
    title: "Dungeons & Dragons at The Wolf Den — Interest Survey",
    description:
        "Tell us how you'd like to play D&D at The Wolf Den in Montgomery, MN: campaign or one shot, which day and time, how often, and how long each session should run.",
    keywords: [
        "Dungeons and Dragons Montgomery MN",
        "D&D group near me",
        "DnD one shot",
        "tabletop RPG Montgomery MN",
        "D&D campaign local game store",
    ],
    alternates: {
        canonical: "/dnd",
    },
};

export default function DndSurveyPage() {
    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>Dungeons &amp; Dragons at The Wolf Den</h1>
                <p>
                    We want to get D&amp;D running at the shop, and the fastest way to pick a night everybody can
                    actually make is to ask. Six quick questions — no account needed, and you don&apos;t have to have
                    played before.
                </p>
                <p className="secondary">Answers go straight to us. Nothing is posted publicly.</p>
            </section>

            <DndSurveyClient />
        </div>
    );
}
