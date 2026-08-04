import GuideClient from "@/components/GuideClient";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "The Pathfinder | The Wolf Den",
    description: "A guide through the Den, one thing at a time — and it pays you for every step.",
};

// Deliberately NOT gated behind a sign-in redirect. Somebody who hasn't signed up yet should be able to look at
// this and see what the place actually is; the client shows a sign-in card instead of the book.
export default function GuidePage() {
    return (
        <div className="stack reveal">
            <GuideClient />
        </div>
    );
}
