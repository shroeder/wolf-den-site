import { notFound } from "next/navigation";

import { DND_QUESTIONS, labelFor } from "@/lib/dnd-survey";
import { getDndSurveyReport } from "@/lib/dnd-survey-store";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { hasOwnerStanding } from "@/lib/marketplace/owner.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "D&D Survey Results",
    robots: { index: false, follow: false },
};

// Owner-only read of the survey. 404s rather than redirecting for anyone else: the page's existence is not
// something a member needs to know about, and a "you may not see this" is an invitation to keep trying.
//
// hasOwnerStanding, not isOwner — isOwner is the unreleased-feature preview key and holds one hardcoded id,
// while the people who actually run the shop are recognised by the owner badge.

function shareOf(count, total) {
    return total > 0 ? Math.round((count / total) * 100) : 0;
}

export default async function DndResultsPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer || !(await hasOwnerStanding(buyer.id))) {
        notFound();
    }

    const report = await getDndSurveyReport();
    const { total, counts, responses } = report;

    return (
        <div className="stack reveal">
            <section className="card hero-accent">
                <h1>D&amp;D survey results</h1>
                <p className="secondary">
                    {total === 0
                        ? "No responses yet. The form is live at /dnd."
                        : `${total} response${total === 1 ? "" : "s"} so far. Day and time count more than once per person — those questions let people pick every slot that works.`}
                </p>
            </section>

            {DND_QUESTIONS.map((question) => {
                const tally = counts[question.id] || {};
                const top = Math.max(1, ...Object.values(tally));

                return (
                    <section className="card" key={question.id}>
                        <h2 className="dnd-result-heading">{question.prompt}</h2>
                        <ul className="dnd-result-bars">
                            {question.options.map((option) => {
                                const count = tally[option.value] || 0;
                                return (
                                    <li key={option.value} className="dnd-result-row">
                                        <span className="dnd-result-label">{option.label}</span>
                                        <span className="dnd-result-track">
                                            <span className="dnd-result-fill" style={{ width: `${Math.round((count / top) * 100)}%` }} />
                                        </span>
                                        <span className="dnd-result-count">
                                            {count}
                                            <span className="muted"> · {shareOf(count, total)}%</span>
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                );
            })}

            {responses.length > 0 ? (
                <section className="card">
                    <h2 className="dnd-result-heading">Every response</h2>
                    <ul className="dnd-response-list">
                        {responses.map((r) => (
                            <li key={r.id} className="dnd-response">
                                <div className="dnd-response-head">
                                    <strong>{r.name || "Anonymous"}</strong>
                                    {r.contact ? <span className="dnd-response-contact">{r.contact}</span> : null}
                                    <span className="muted">{new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                </div>
                                <p className="dnd-response-answers">
                                    {labelFor("experience", r.experience)} · {labelFor("format", r.format)} ·{" "}
                                    {r.days.map((d) => labelFor("days", d)).join(", ")} ·{" "}
                                    {r.times.map((t) => labelFor("times", t)).join(", ")} ·{" "}
                                    {labelFor("frequency", r.frequency)} · {labelFor("sessionLength", r.sessionLength)}
                                </p>
                                {r.notes ? <p className="dnd-response-notes">{r.notes}</p> : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </div>
    );
}
