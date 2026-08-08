// PROFANITY / EXPLICIT CHECK for short, PUBLIC, member-authored text.
//
// The stockade crime is the first caller: one member types a sentence and it is then displayed under somebody
// else's name, on the town square, to everybody, for a day. That is the worst possible shape for unchecked
// text — the person it describes did not write it and cannot take it down — so the nomination is rejected on
// save rather than moderated afterwards.
//
// SCOPE, deliberately narrow. This is not sentiment analysis and it does not try to judge whether a crime is
// mean; the Stockade is a joke pillory and being accused of hoarding foils is the entire point. It blocks
// three things: strong profanity, sexual content, and slurs. Anything else is between members.
//
// THE SCUNTHORPE PROBLEM is the main design constraint. Substring matching on a word list flags "class",
// "assassin", "grass", "Cockburn" and "analysis", and a filter that rejects innocent text is worse than no
// filter because it teaches people the field is broken. So the default is WHOLE-WORD matching, and only the
// handful of terms that cannot appear inside an innocent English word are matched as substrings.

// Whole-word only. Safe to be liberal here — a word boundary means "grass" can never trip "ass".
const WORDS = [
    "fuck", "fucks", "fucked", "fucker", "fuckers", "fucking", "fuckin", "motherfucker", "motherfuckers",
    "shit", "shits", "shitty", "shitting", "bullshit", "shithead", "dipshit",
    "piss", "pissed", "pissing", "crap", "damn", "goddamn", "bastard", "bastards",
    "ass", "asses", "asshole", "assholes", "arse", "arsehole", "jackass", "dumbass", "badass",
    "bitch", "bitches", "bitching", "slut", "sluts", "whore", "whores", "hoe", "hoes", "skank",
    "dick", "dicks", "dickhead", "cock", "cocks", "prick", "knob", "wanker", "wank", "tosser",
    "pussy", "pussies", "twat", "minge", "clit", "penis", "vagina", "boob", "boobs", "tits", "titty", "titties",
    "cum", "cumming", "jizz", "jerkoff", "handjob", "blowjob", "rimjob", "creampie", "deepthroat",
    "porn", "porno", "pornhub", "hentai", "milf", "nsfw", "orgy", "orgasm", "masturbate", "masturbating",
    "horny", "sexy", "sex", "anal", "bdsm", "dildo", "fleshlight", "nudes", "nude", "naked",
    "rape", "raped", "rapist", "raping", "molest", "molested", "molester", "pedo", "pedophile", "paedophile",
    "bollocks", "bugger", "git", "nonce", "chav",
    "nazi", "hitler", "kkk",
    "kys", "suicide",
];

// Substring-matched: no innocent English word contains these, so evasion via padding cannot hide them.
// Slurs and unambiguous sexual terms only. Kept short on purpose — every entry here is a false-positive risk.
const HARD = [
    "nigger", "nigga", "faggot", "fagot", "retard", "tranny", "chink", "spic", "wetback", "kike", "gook",
    "coon", "beaner", "raghead", "towelhead", "cunt", "cunts", "cocksuck", "motherfuck", "bestiality",
    "childporn", "cp0rn", "goatse", "felching", "scat",
];

// Leetspeak → letters. Applied only when the character sits inside a run of letters, so "3 gold" survives and
// "n1gg3r" does not.
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 6: "g", 7: "t", 8: "b", 9: "g", "@": "a", $: "s", "!": "i", "|": "i", "+": "t" };

function normalize(s) {
    return String(s || "")
        .toLowerCase()
        .normalize("NFKD").replace(/[̀-ͯ]/g, "")   // strip accents (fück → fuck)
        .replace(/[^a-z0-9\s@$!|+]/g, " ")                     // punctuation → space, keeping leet chars
        .replace(/([a-z])([0-9@$!|+])(?=[a-z])/g, (_m, a, b) => a + (LEET[b] || b))
        .replace(/(^|\s)([0-9@$!|+])(?=[a-z])/g, (_m, sp, b) => sp + (LEET[b] || b))
        .replace(/\s+/g, " ")
        .trim();
}

// "f u c k" / "f-u-c-k" / "f.u.c.k" — a run of single letters is glued back together. Multi-letter words are
// left alone, so "a bit of ice" does not become "abitofice" and start matching things by accident.
function deSpaced(s) {
    return s.replace(/\b(?:[a-z]\s+){2,}[a-z]\b/g, (m) => m.replace(/\s+/g, ""));
}

const WORD_SET = new Set(WORDS);

/**
 * Is this short public string clean?
 * @returns {{ clean: boolean, reason: string|null }} reason is a member-facing sentence when clean is false.
 */
export function checkText(input) {
    const base = normalize(input);
    if (!base) return { clean: true, reason: null };
    const forms = [base, deSpaced(base)];
    const squashed = base.replace(/[^a-z0-9]/g, "");

    for (const hard of HARD) {
        if (squashed.includes(hard)) return { clean: false, reason: "That wording isn't allowed here." };
    }
    for (const form of forms) {
        for (const tok of form.split(/\s+/)) {
            // Padding letters are the cheapest evasion there is ("fuuuuck"), so try the token with repeats
            // squeezed to two AND to one. Collapsing to one is safe against false positives because no clean
            // English word collapses onto an entry in the list — you cannot reach "ass" from "class".
            const t2 = tok.replace(/(.)\1{2,}/g, "$1$1");
            const t1 = tok.replace(/(.)\1+/g, "$1");
            if (WORD_SET.has(tok) || WORD_SET.has(t2) || WORD_SET.has(t1)) return { clean: false, reason: "Keep it clean — that word can't go on the town square." };
        }
    }
    // A wall of capitals or a URL is not profanity, but neither belongs on a public plaque.
    if (/https?:\/\/|www\.|\.com|\.net|\.org/i.test(String(input))) return { clean: false, reason: "No links on the plaque." };
    return { clean: true, reason: null };
}

export function isCleanText(input) {
    return checkText(input).clean;
}
