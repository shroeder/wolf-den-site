// ── WRITTEN, WIRED, NEVER MOUNTED ────────────────────────────────────────────────────────────────────────────
//
// Three of these shipped in a single day, all the same shape: a handler and its derived values declared inside
// a component, fully implemented, and referenced by nothing.
//
//     const buyRaidReset = useCallback(async () => { … }, [act, openRaid]);
//     const resetCost = state.raid?.reset?.cost ?? 0;
//     const raidResetTooPoor = resetCost > 0 && state.gold < resetCost;
//
// All three lived in SailingClient for weeks. The escalating price was recomputed on every render, the handler
// was correct, the server route worked — and no button in the file ever called it, so paying for another
// battle was unreachable from the screen everyone actually looks at. The same day: the arena's REFUSALS map,
// three carefully written sentences that no member had ever seen.
//
// It is a nasty class precisely because everything about it looks finished. There is no crash, no warning, and
// `next build` compiles it happily. The only symptom is a user saying "I click it and nothing happens" about a
// button that is not there.
//
// ── WHY NOT `no-unused-vars` ─────────────────────────────────────────────────────────────────────────────────
// Because it reports 802 findings in this repo, which is how `npm run lint` stopped meaning anything (see the
// note at the top of eslint.undef.mjs). Nearly all of that is module-level: destructured API fields, unused
// imports, a `catch (err)` nobody reads. None of it is this bug.
//
// So this rule looks in one place — INSIDE a React component or hook — and at one kind of declaration: the
// things that only exist to be rendered or called. A `useCallback` nothing calls is always a mistake. A
// module-level const nobody reads usually is not.
//
// ── WHAT IT CANNOT CATCH ─────────────────────────────────────────────────────────────────────────────────────
// The third bug of that day is out of reach and it is worth being honest about. The arena's error banner WAS
// referenced — `{err ? <p className="ar-err">{err}</p> : null}` — but the only place it was rendered sat below
// an early return, so it was unreachable from three of the four screens that set it. That is a reachability
// problem, not an unused-variable one, and no amount of scope analysis will find it. Read the render tree.
const HOOKS = new Set(["useCallback", "useMemo"]);

/** A component or a custom hook: `function Foo()`, `const Foo = () => {}`, `function useBar()`. */
function componentName(node) {
    const name = node.id?.name
        || (node.parent?.type === "VariableDeclarator" ? node.parent.id?.name : null);
    if (!name) return null;
    const isComponent = /^[A-Z]/.test(name);
    const isHook = /^use[A-Z]/.test(name);
    return isComponent || isHook ? name : null;
}

function enclosingComponent(node) {
    for (let n = node.parent; n; n = n.parent) {
        if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") {
            const name = componentName(n);
            if (name) return name;
            // A plain nested function is not a component; keep walking outward rather than giving up, because
            // a handler defined inside a `useEffect` still belongs to the component around it.
        }
    }
    return null;
}

export default {
    meta: {
        type: "problem",
        docs: { description: "A handler or derived value declared in a component and referenced by nothing" },
        schema: [],
        messages: {
            dead: "`{{name}}` is declared in {{where}} and never referenced — a handler nothing calls is a "
                + "feature nobody can reach. Render it, or delete it.",
        },
    },
    create(context) {
        const source = context.sourceCode || context.getSourceCode();
        const candidates = [];
        // ── JSX IS NOT A "REFERENCE" ─────────────────────────────────────────────────────────────────────
        // `<Kicker />` does not create a read in ESLint's scope analysis — that is why `react/jsx-uses-vars`
        // exists at all, and it works by calling markVariableAsUsed() rather than by adding a reference. So a
        // rule that only inspects `variable.references` reports every nested component in the file. Caught by
        // running it: the first pass flagged Kicker and TrackIco in SailingClient, both rendered four and
        // three times respectively. Names used anywhere in JSX are collected here and cleared below.
        const usedInJsx = new Set();

        function collect(node, name) {
            const where = enclosingComponent(node);
            if (!where) return;
            for (const v of source.getDeclaredVariables(node)) {
                if (v.name === name) candidates.push({ v, node, name, where });
            }
        }

        return {
            JSXIdentifier(node) { usedInJsx.add(node.name); },
            VariableDeclarator(node) {
                if (node.id.type !== "Identifier" || !node.init) return;
                const { init } = node;
                const isHookCall = init.type === "CallExpression"
                    && init.callee.type === "Identifier" && HOOKS.has(init.callee.name);
                const isFn = init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression";
                // Only the two shapes that exist to be USED. A derived string or number nobody reads is
                // usually dead weight rather than a missing button, and flagging those brings the noise back.
                if (!isHookCall && !isFn) return;
                collect(node, node.id.name);
            },
            FunctionDeclaration(node) {
                if (!node.id) return;
                // A nested named function inside a component — `async function send(e) {…}` — is the same
                // shape as the arrow handlers around it.
                if (componentName(node)) return;   // it IS a component; not our business
                collect(node, node.id.name);
            },
            "Program:exit": function reportDead() {
                for (const { v, node, name, where } of candidates) {
                    if (v.references.some((r) => r.isRead())) continue;
                    if (usedInJsx.has(name)) continue;
                    context.report({ node: v.defs[0]?.name || node, messageId: "dead", data: { name, where } });
                }
            },
        };
    },
};
