// ── AN ANNOUNCEMENT IS NOT A CHAT MESSAGE ────────────────────────────────────────────────────────────────────
// PURE. No DB, no server-only — the town renders it and the admin app previews the same parse.
//
// The Arbiter posts patch notes into the plaza, and the plaza renders a message as one `<span>` of text. A
// three-hundred-word post therefore arrived as an unbroken grey wall between "👋" and "🔥🔥🔥", and the last
// one was long enough to push every other message off the screen. Luke, reading it: "the response from the
// arbiter should be easier to read than a text blob."
//
// So the Arbiter gets a format. Deliberately TINY — four rules, all of them things somebody would type anyway:
//
//   # Heading          a line starting with "# " is a section head
//   - bullet           a line starting with "- " or "• " is a list item
//   /images/x.webp     a bare image path or https URL, alone on its line, is a picture
//   (blank line)       ends a paragraph
//   anything else      a paragraph
//
// No bold, no italics, no links, no nesting. Every one of those is a thing to escape, and this text is written
// by us and rendered into a public room — the smallest grammar that solves the problem is the whole brief. The
// parser returns DATA, never markup, so the renderer decides what an element is and nothing can inject one.
//
// It applies to the Arbiter alone. A member's message stays exactly what they typed, because a formatter that
// eats somebody's "- - -" and turns it into a bullet is a formatter that edits people's words.
//
// ── AND THE ARBITER MAY SHOW A PICTURE ───────────────────────────────────────────────────────────────────────
// Luke: "the arbiter only can put images and sprites in his chat messages." A patch note about a coin, a pet or
// a piece of gear is doing its work with the thing on screen rather than described, and the Den's sprites
// already exist for every one of them.
//
// The syntax is a bare path on its own line, because that is what somebody pastes anyway. It is recognised
// only for the Arbiter — the same restriction the rest of this grammar has — and only for a path or an https
// URL with no spaces in it, so a sentence can never turn into an image by accident.

/** The Arbiter's buyer row, which is a row and not code — see the memory note. Matched on alias, never on id. */
export const NOTICE_ALIAS = "arbiter";

/**
 * Parse an announcement into blocks.
 *
 * @returns {Array<{kind: "head"|"text", text: string} | {kind: "list", items: string[]} | {kind: "image", src: string}>}
 */
// One line, no spaces, and either a site-relative path or an https URL. Anything else is prose.
export const isNoticeImage = (line = "") =>
    /^(\/[\w\-./]+|https:\/\/[^\s]+)$/.test(String(line).trim())
    && /\.(webp|png|jpe?g|gif|svg)$/i.test(String(line).trim());

export function parseNotice(body = "") {
    const lines = String(body || "").replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let para = [];
    let list = null;
    const flushPara = () => { if (para.length) { blocks.push({ kind: "text", text: para.join(" ") }); para = []; } };
    const flushList = () => { if (list && list.length) { blocks.push({ kind: "list", items: list }); } list = null; };
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) { flushPara(); flushList(); continue; }
        if (line.startsWith("# ")) {
            flushPara(); flushList();
            blocks.push({ kind: "head", text: line.slice(2).trim() });
            continue;
        }
        // A picture: a lone path or URL, no spaces. Checked before the bullet and paragraph rules so a
        // filename with a dash in it cannot be read as a list item.
        if (isNoticeImage(line)) {
            flushPara(); flushList();
            blocks.push({ kind: "image", src: line });
            continue;
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
            flushPara();
            (list = list || []).push(line.slice(2).trim());
            continue;
        }
        flushList();
        para.push(line);
    }
    flushPara(); flushList();
    return blocks;
}

/**
 * The one-line gist, for the collapsed state.
 *
 * A notice opens collapsed in the plaza — the chat log is a shared room and a member scrolling for "who is
 * online" should not have to scroll past a patch note to find it. This is what they see until they open it:
 * the first heading if there is one, otherwise the first sentence.
 */
export function noticeGist(body = "") {
    const blocks = parseNotice(body);
    const head = blocks.find((b) => b.kind === "head");
    if (head) return head.text;
    const text = blocks.find((b) => b.kind === "text");
    if (!text) return "An announcement";
    const first = text.text.split(/(?<=[.!?])\s/)[0] || text.text;
    return first.length > 120 ? `${first.slice(0, 117)}…` : first;
}

/** How many separate things a notice says — the number on the "show it" button. */
export const noticeCount = (body = "") =>
    parseNotice(body).reduce((n, b) => n + (b.kind === "list" ? b.items.length : 0), 0);
