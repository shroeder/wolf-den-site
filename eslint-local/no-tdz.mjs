// ── THE ONE USE-BEFORE-DEFINE THAT ACTUALLY THROWS ───────────────────────────────────────────────────────────
//
// ESLint's own `no-use-before-define` reports 85 findings in this repo and 84 of them are fine: a function
// declared at the top of a module that mentions a `const` declared at the bottom is perfectly safe, because
// the function does not run until the module has finished evaluating. Turning that rule on wholesale would
// have handed the fast gate a permanent wall of red, which is precisely how `npm run lint` stopped meaning
// anything (see the note in eslint.undef.mjs).
//
// The 85th is a real crash. This is the shape:
//
//     const active = ladder ? (tab || ownTab) : "shop";
//     const ladder = Boolean(combat?.fleet);
//
// Both lines run, in order, the moment the component renders — so `ladder` is read while it is still in the
// temporal dead zone and the whole panel dies with "Cannot access 'p' before initialization". `next build`
// compiles it without a word (it is valid syntax), no-undef has nothing to say (the name is defined), and the
// runtime error names a MINIFIED variable, so the crash report tells you nothing about where to look.
//
// The distinction that matters is not "before" — it is "before, in the same breath". A reference is dangerous
// only when nothing defers it: no function boundary between the reference and the declaration. That is what
// this rule checks, and it is why it can be an error rather than a warning.
const FUNCTION_SCOPES = new Set(["function", "class-field-initializer", "class-static-block"]);

/** The nearest scope that defers execution, or the module/global root. */
function deferralBoundary(scope) {
    for (let s = scope; s; s = s.upper) if (FUNCTION_SCOPES.has(s.type) || !s.upper) return s;
    return null;
}

export default {
    meta: {
        type: "problem",
        docs: { description: "Flag a const/let/class read before its declaration with nothing deferring it — a guaranteed TDZ throw." },
        schema: [],
        messages: {
            tdz: "'{{name}}' is read on line {{line}} but declared on line {{declLine}}, in the same scope — this throws at runtime.",
        },
    },
    create(context) {
        const source = context.sourceCode ?? context.getSourceCode();

        function check(scope) {
            for (const variable of scope.variables) {
                const def = variable.defs[0];
                // `var` hoists to undefined rather than throwing, and a function declaration hoists whole.
                if (!def || def.type !== "Variable" ? def?.type !== "ClassName" : def.parent.kind === "var") continue;
                const declStart = def.name.range[0];
                const declScope = deferralBoundary(variable.scope);

                for (const ref of variable.references) {
                    const id = ref.identifier;
                    if (id.range[0] >= declStart) continue;                       // read after the declaration: fine
                    if (deferralBoundary(ref.from) !== declScope) continue;       // a function defers it: fine
                    context.report({
                        node: id,
                        messageId: "tdz",
                        data: {
                            name: variable.name,
                            line: String(id.loc.start.line),
                            declLine: String(def.name.loc.start.line),
                        },
                    });
                }
            }
            scope.childScopes.forEach(check);
        }

        return { "Program:exit": (node) => check(source.getScope(node)) };
    },
};
