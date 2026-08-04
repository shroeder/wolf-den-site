import AdminLoginClient from "@/components/AdminLoginClient";
import SurveyResults from "@/components/SurveyResults";
import { getAdminWebSession, getMarketplaceAdmin } from "@/lib/admin-app/web-session";
import { surveyResults } from "@/lib/marketplace/survey.js";

export const metadata = {
    title: "Survey Results | The Wolf Den",
    robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Server-rendered on the marketplace admin session rather than the paste-your-key panel pattern: the data is
// already server-side, so fetching it through an API from the client would only add a round trip and a second
// auth path to get wrong.
export default async function SurveyResultsPage() {
    const admin = await getMarketplaceAdmin();
    if (!admin) {
        const session = await getAdminWebSession();
        return <AdminLoginClient noAccessName={session ? session.user.displayName : null} />;
    }
    return <SurveyResults data={await surveyResults()} />;
}
