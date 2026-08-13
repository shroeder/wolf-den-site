"use client";

import { useMemo, useState } from "react";

import { noticeCount, noticeGist, parseNotice } from "@/lib/marketplace/notice-format.js";

// ── THE ARBITER'S POSTS, AS SOMETHING YOU CAN ACTUALLY READ ──────────────────────────────────────────────────
// Patch notes go into global chat, and chat renders a message as one span — so a three-hundred-word post
// arrives as an unbroken wall that pushes the whole conversation off the screen.
//
// IT LIVES IN ITS OWN FILE BECAUSE GLOBAL CHAT HAS TWO RENDERERS. The plaza draws it (TownClient) and so does
// the Social panel (SocialHub), off the same rows from the same getGlobalChat. The first cut of this was a
// local component inside TownClient, which fixed exactly one of them — the post went out and landed in the
// Social panel still a wall, with the literal "# " on the front of it. Two renderers of one thing will always
// drift; the only fix that holds is that there is one component and both import it.
//
// COLLAPSED BY DEFAULT, and that is the important half. Chat is a shared room; somebody scrolling it to see
// who is about should not have to scroll past a changelog to get there.
//
// Structure comes from parseNotice, which returns DATA — headings, paragraphs, lists — never markup. Nothing
// here interpolates a string into the DOM, so a notice cannot carry anything but text no matter who writes it.
//
// `className` is the host's own bubble class (tw-clog-body, gchat-body) so the notice inherits whichever chat
// it is sitting in rather than carrying a second copy of that styling.
export default function NoticeBody({ body, className = "" }) {
    const [open, setOpen] = useState(false);
    const blocks = useMemo(() => parseNotice(body), [body]);
    const gist = useMemo(() => noticeGist(body), [body]);
    const count = useMemo(() => noticeCount(body), [body]);
    // A short one is just a message with a bit of shape on it — no point hiding three lines behind a button.
    const short = blocks.length <= 2 && count <= 2;

    if (!open && !short) {
        return (
            <span className={`${className} wd-notice is-shut`}>
                <b className="wd-notice-gist">{gist}</b>
                <button type="button" className="wd-notice-more" onClick={() => setOpen(true)}>
                    Read it{count ? ` · ${count} change${count === 1 ? "" : "s"}` : ""}
                </button>
            </span>
        );
    }
    return (
        <span className={`${className} wd-notice`}>
            {blocks.map((b, i) => {
                if (b.kind === "head") return <b key={i} className="wd-notice-head">{b.text}</b>;
                if (b.kind === "list") {
                    return (
                        <span key={i} className="wd-notice-list">
                            {b.items.map((it, j) => (
                                <span key={j} className="wd-notice-item"><i aria-hidden="true" />{it}</span>
                            ))}
                        </span>
                    );
                }
                return <span key={i} className="wd-notice-p">{b.text}</span>;
            })}
            {short ? null : (
                <button type="button" className="wd-notice-more" onClick={() => setOpen(false)}>Close</button>
            )}
        </span>
    );
}
