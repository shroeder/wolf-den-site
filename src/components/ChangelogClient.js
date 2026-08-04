"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { TAG_META } from "@/lib/marketplace/changelog.js";

// ── WHAT'S NEW ───────────────────────────────────────────────────────────────────────────────────────────────
// A list of what shipped, and — the reason this screen is worth having — WHO ASKED FOR IT. A member who wrote
// one line in a survey and then saw their own hero next to the thing that got built out of it is a member who
// answers the next survey.
//
// The owner gets a Post button per entry that pushes it to the den channel on Discord. Deliberately manual: a
// feature ships when it builds, but it should be announced when somebody decides it's ready to be looked at.
//
// Rules on <Link> live in the global block — styled-jsx does not scope a custom component (check:styled-jsx).

export default function ChangelogClient({ entries = [], owner = false }) {
    const [busy, setBusy] = useState(null);
    const [sent, setSent] = useState({});

    const post = useCallback(async (key) => {
        setBusy(key);
        const r = await fetch("/api/marketplace/changelog", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }),
        }).then((x) => x.json()).catch(() => null);
        setBusy(null);
        setSent((s) => ({ ...s, [key]: r?.ok ? "Posted to Discord" : `Failed — ${r?.error || "unknown"}` }));
    }, []);

    return (
        <section className="card cl">
            <div className="cl-head">
                <h1 className="cl-title">What&rsquo;s New</h1>
                <p className="cl-sub">Everything that&rsquo;s shipped lately — and who asked for it.</p>
            </div>

            <div className="cl-list">
                {entries.map((e) => {
                    const tag = TAG_META[e.tag] || TAG_META.new;
                    return (
                        <article key={e.key} className="cl-entry" style={{ "--tag": tag.color }}>
                            <div className="cl-entry-top">
                                <span className="cl-tag">{tag.label}</span>
                                <span className="cl-date">{e.date}</span>
                                {e.ownerOnly ? <span className="cl-staged">not public yet</span> : null}
                            </div>
                            <h2 className="cl-h2">{e.title}</h2>
                            <p className="cl-blurb">{e.blurb}</p>

                            {e.credits?.length ? (
                                <div className="cl-credit">
                                    <span className="cl-credit-label">You asked for this</span>
                                    <div className="cl-credit-people">
                                        {e.credits.map((c) => (
                                            <span key={c.alias} className="cl-person">
                                                {c.sprite ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={c.sprite} alt="" draggable="false" />
                                                ) : <i className="cl-noface" aria-hidden="true" />}
                                                {c.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            <div className="cl-foot">
                                {e.href ? <Link className="cl-go" href={e.href}>Take a look</Link> : <span />}
                                {owner ? (
                                    <button type="button" className="cl-post" disabled={busy === e.key} onClick={() => post(e.key)}>
                                        {busy === e.key ? "Posting…" : sent[e.key] || "Post to Discord"}
                                    </button>
                                ) : null}
                            </div>
                        </article>
                    );
                })}
            </div>

            <style jsx>{`
                .cl-head { margin-bottom: 16px; }
                .cl-title { margin: 0; font-size: 1.4rem; font-weight: 900;
                    background: linear-gradient(92deg, #ffe9b0, #ffb020); -webkit-background-clip: text; background-clip: text; color: transparent; }
                .cl-sub { margin: 4px 0 0; font-size: 12.5px; color: #9aa2ab; }
                .cl-list { display: grid; gap: 12px; }
                .cl-entry { padding: 15px 16px; border-radius: 15px; background: rgba(255,255,255,0.035);
                    border: 1px solid rgba(255,255,255,0.09); border-left: 3px solid var(--tag); }
                .cl-entry-top { display: flex; align-items: center; gap: 9px; }
                .cl-tag { font-size: 9.5px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase;
                    padding: 2px 8px; border-radius: 999px; color: #120e1a; background: var(--tag); }
                .cl-date { font-size: 11px; color: #7f8790; font-variant-numeric: tabular-nums; }
                .cl-staged { font-size: 9.5px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase;
                    padding: 2px 8px; border-radius: 999px; color: #ffd0a0; border: 1px solid rgba(255,208,160,0.4); }
                .cl-h2 { margin: 8px 0 0; font-size: 1.05rem; font-weight: 900; color: #fff; }
                .cl-blurb { margin: 6px 0 0; font-size: 12.5px; line-height: 1.6; color: #b9c2cc; }

                /* The credit block is the whole point of the page, so it gets the gold. */
                .cl-credit { margin-top: 12px; padding: 10px 12px; border-radius: 12px;
                    background: rgba(255,176,32,0.1); border: 1px solid rgba(255,215,94,0.35); }
                .cl-credit-label { font-size: 9.5px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: #ffd75e; }
                .cl-credit-people { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 7px; }
                .cl-person { display: inline-flex; align-items: center; gap: 7px; padding: 4px 11px 4px 4px; border-radius: 999px;
                    font-size: 12px; font-weight: 900; color: #ffe28a; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,215,94,0.3); }
                .cl-person img { width: 24px; height: 24px; border-radius: 50%; object-fit: contain; background: rgba(255,255,255,0.06); }
                .cl-noface { width: 24px; height: 24px; border-radius: 50%; background: rgba(255,255,255,0.1); }

                .cl-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 13px; }
                .cl-post { padding: 8px 14px; border-radius: 10px; cursor: pointer; font-size: 11.5px; font-weight: 900;
                    color: #cbd3dc; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16); }
                .cl-post:disabled { opacity: .6; }
            `}</style>

            <style jsx global>{`
                .cl-go { display: inline-block; padding: 8px 15px; border-radius: 10px; text-decoration: none;
                    font-size: 12px; font-weight: 900; color: #241500; background: linear-gradient(180deg, #ffe08a, #ffb020); }
            `}</style>
        </section>
    );
}
