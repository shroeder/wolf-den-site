import nextVitals from "eslint-config-next/core-web-vitals";

import { GLOBALS } from "./eslint.config.mjs";
import noTdz from "./eslint-local/no-tdz.mjs";

// ── THE FAST GATE ────────────────────────────────────────────────────────────────────────────────────────────
// `npm run lint` also reports ~100 pre-existing react-hooks findings, so its exit code stopped meaning anything
// and nobody ran it. That is how `prospect is not defined` shipped: the no-undef rule that would have caught it
// was already configured and already correct — it just never ran.
//
// So this config runs ONE rule, the only one that catches "calls a function that does not exist", and it is
// GREEN today. A red exit here is always a real bug, which is what makes it worth running before every push.
//
//   npm run lint:undef
//
// It reuses next's own config for the parser, the JSX handling and the globals it knows about — with every rule
// blanked out — so the gate can never disagree with the real lint about what the code MEANS, only about which
// findings it reports.
const silenced = nextVitals.map((c) => ({ ...c, rules: {} }));

export default [
    // Generated output is not source. Without this the gate spends its time on turbopack chunks and reports
    // `importScripts is not defined` in a service worker bundle.
    { ignores: [".next/**", "node_modules/**", "out/**", "public/sw.js", "public/firebase-messaging-sw.js"] },
    ...silenced,
    {
        languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: GLOBALS },
        plugins: { local: { rules: { "no-tdz": noTdz } } },
        linterOptions: { reportUnusedDisableDirectives: false },
        rules: {
            "no-undef": "error",
            // Added after a conditional useMemo — placed below two early returns — took the whole Store page
            // down with "rendered more hooks than during the previous render". `next build` cannot catch it
            // (the page is force-dynamic, so it is never prerendered) and no-undef has nothing to say about it.
            // It is the same class of defect: correct-looking code that only fails when it runs.
            "react-hooks/rules-of-hooks": "error",
            // Added after `const active = ladder ? …` was written two lines ABOVE `const ladder`, which throws
            // the moment the component renders — and which `next build` compiles without a word, because it is
            // perfectly valid syntax. Same class again: correct-looking code that only fails when it runs, and
            // the crash names a MINIFIED variable, so the report tells you nothing about where to look.
            //
            // Not eslint's own `no-use-before-define`: that reports 85 findings here and 84 are safe (a
            // function mentioning a const declared below it does not run until the module is evaluated). This
            // one flags only a read with NO function boundary deferring it — the reads that always throw.
            "local/no-tdz": "error",
            // ── AND THE JSX HALF OF THE SAME RULE ────────────────────────────────────────────────────────
            // `no-undef` does NOT see component names in JSX — <RecipeShelf /> with no import is invisible to
            // it. That gap took /marketplace/sailing down in production with "RecipeShelf is not defined"
            // after a shelf was swapped into the Quartermaster and the import was not, and this gate ran
            // green over it twice. It is precisely the defect the gate exists to catch, wearing angle
            // brackets. `next build` compiles it without a word because it is valid syntax.
            "react/jsx-no-undef": "error",
        },
    },
    {
        // API routes are server code with no React in them, but the rule fires on any function called useX —
        // useConsumable, useItem and useCharge are all "use this item", not hooks.
        files: ["src/app/api/**"],
        rules: { "react-hooks/rules-of-hooks": "off" },
    },
];
