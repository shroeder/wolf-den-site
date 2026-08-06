"use client";

// ── THE DEN'S ONE LEADERBOARD ────────────────────────────────────────────────────────────────────────────────
// Every board in the game reads the same way: a metal rank chip, the member's face, what they did, and — the
// part that actually makes a board worth opening — where YOU sit in it and what the gap is.
//
// The styling lives in globals.css, NOT in a styled-jsx block. A <style jsx> block only scopes onto elements
// written in the JSX of the component that owns it, so the moment rows move into their own function every rule
// aimed at them matches nothing. That is exactly how the sailing boards shipped with unstyled rows and a boat
// image at its natural size — a full-page ship. Shared classes in the global sheet cannot fail that way.
//
// Row shape: { place, who, avatar, art?, you, value, unit, sub? }

function RankChip({ place }) {
    const metal = place <= 3 ? ["is-gold", "is-silver", "is-bronze"][place - 1] : "";
    return (
        <span className={`lb-rank ${metal}`} aria-hidden="true">
            <b>{place}</b>
        </span>
    );
}

export function LeaderboardRow({ r }) {
    return (
        <div className={`lb-row${r.you ? " is-you" : ""}${r.place <= 3 ? " is-podium" : ""}`}>
            <RankChip place={r.place} />
            {r.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="lb-face" src={r.avatar} alt="" width={38} height={38} draggable="false" />
            ) : null}
            <span className="lb-who">
                {/* The name ellipses; the YOU tag must not. Both inside one ellipsing element clipped the tag
                    itself to "Y…" on any row with a long name. */}
                <b><span className="lb-name">{r.who}</span>{r.you ? <i className="lb-youtag">you</i> : null}</b>
                {r.sub ? <em>{r.sub}</em> : null}
            </span>
            {r.art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="lb-art" src={r.art} alt="" draggable="false" />
            ) : null}
            <span className="lb-stat">
                <b>{r.value}</b>
                <em>{r.unit}</em>
            </span>
        </div>
    );
}

// `mine` is the viewer's row when they placed outside the visible top — pinned to the bottom after a gap, with
// the distance to the next rung. A board that can't tell you where you are is a wall of other people's names.
export default function Leaderboard({ rows = [], mine = null, total = null, unitPlural = "members", empty = "Nobody yet." }) {
    if (!rows.length) return <p className="lb-empty">{empty}</p>;
    const gap = mine?.toNext;
    return (
        <div className="lb">
            {total ? <p className="lb-total">{total.toLocaleString()} {unitPlural} ranked</p> : null}
            <div className="lb-rows">
                {rows.map((r) => <LeaderboardRow key={`${r.place}-${r.who}`} r={r} />)}
                {mine ? (
                    <>
                        <div className="lb-gap" aria-hidden="true"><i /><i /><i /></div>
                        <LeaderboardRow r={{ ...mine, you: true }} />
                        {gap ? <p className="lb-chase">{gap}</p> : null}
                    </>
                ) : null}
            </div>
        </div>
    );
}
