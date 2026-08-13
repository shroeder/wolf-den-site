import AdminLoginClient from "@/components/AdminLoginClient";
import SurveyResults from "@/components/SurveyResults";
import { getAdminWebSession, getMarketplaceAdmin } from "@/lib/admin-app/web-session";
import { surveyResults, SURVEY_ROUND } from "@/lib/marketplace/survey.js";

export const metadata = {
    title: "Survey Results | The Wolf Den",
    robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Server-rendered on the marketplace admin session rather than the paste-your-key panel pattern: the data is
// already server-side, so fetching it through an API from the client would only add a round trip and a second
// auth path to get wrong.
export default async function SurveyResultsPage({ searchParams }) {
    const admin = await getMarketplaceAdmin();
    if (!admin) {
        const session = await getAdminWebSession();
        return <AdminLoginClient noAccessName={session ? session.user.displayName : null} />;
    }
    // ── WHICH ROUND ─────────────────────────────────────────────────────────────────────────────────────
    // ?round=1 reads the first survey. Round 1's answers are kept precisely so the second can be compared
    // against them — a tally with nothing to compare to only tells you what today looks like.
    const p = await searchParams;
    const round = Math.max(1, Math.min(SURVEY_ROUND, Number(p?.round) || SURVEY_ROUND));
    return <SurveyResults data={await surveyResults(round)} round={round} rounds={SURVEY_ROUND} />;
}
