import nextVitals from "eslint-config-next/core-web-vitals";

import { GLOBALS } from "./eslint.config.mjs";

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
        linterOptions: { reportUnusedDisableDirectives: false },
        rules: {
            "no-undef": "error",
            // Added after a conditional useMemo — placed below two early returns — took the whole Store page
            // down with "rendered more hooks than during the previous render". `next build` cannot catch it
            // (the page is force-dynamic, so it is never prerendered) and no-undef has nothing to say about it.
            // It is the same class of defect: correct-looking code that only fails when it runs.
            "react-hooks/rules-of-hooks": "error",
        },
    },
    {
        // API routes are server code with no React in them, but the rule fires on any function called useX —
        // useConsumable, useItem and useCharge are all "use this item", not hooks.
        files: ["src/app/api/**"],
        rules: { "react-hooks/rules-of-hooks": "off" },
    },
];
