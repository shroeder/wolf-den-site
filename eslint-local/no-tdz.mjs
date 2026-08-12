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
// ── AND THE FUNCTION BOUNDARIES THAT DEFER NOTHING ───────────────────────────────────────────────────────────
// "A function boundary means it is deferred" is true of a callback you hand to setTimeout, an event listener or
// a promise. It is NOT true of the array methods, which invoke their callback synchronously, right there, in
// the same breath as the line they are written on:
//
//     frag.forEach(([r, c], i) => { depth[r][c] = perks.surface || halfDug ? 1 : deep(); });
//     const halfDug = powers?.has?.("beachhead");
//
// That shipped. Every dig threw "Cannot access 'halfDug' before initialization", begin_dig 500'd, and the "Dig
// for treasure" button did nothing for everybody — while this rule stayed green, because it saw an arrow
// function between the read and the declaration and assumed something would defer it.
//
// So a callback passed DIRECTLY to one of these methods is treated as running in its caller's breath, which is
// exactly what it does. An IIFE is the same case and is included.
const EAGER_METHODS = new Set([
    "forEach", "map", "filter", "reduce", "reduceRight", "some", "every", "find", "findIndex", "findLast",
    "findLastIndex", "flatMap", "sort", "at",
]);

const FUNCTION_SCOPES = new Set(["function", "class-field-initializer", "class-static-block"]);

/** Does this function run the instant it is written, rather than later? */
function runsImmediately(fnNode) {
    const parent = fnNode?.parent;
    if (!parent) return false;
    // An IIFE: (() => …)() — the call's own callee is the function.
    if (parent.type === "CallExpression" && parent.callee === fnNode) return true;
    // A callback handed straight to an eagerly-invoking method: arr.forEach(fn), arr.map(fn), …
    if (parent.type === "CallExpression" && parent.arguments.includes(fnNode)) {
        const callee = parent.callee;
        if (callee?.type === "MemberExpression" && callee.property?.type === "Identifier") {
            return EAGER_METHODS.has(callee.property.name);
        }
    }
    return false;
}

/**
 * The nearest scope that genuinely defers execution, or the module/global root.
 *
 * A function scope whose function runs immediately is stepped THROUGH rather than stopped at, so a read inside
 * `forEach` resolves to the same boundary as the code around the call — which is what makes it comparable to
 * the declaration's boundary and therefore reportable.
 */
function deferralBoundary(scope) {
    for (let s = scope; s; s = s.upper) {
        if (!s.upper) return s;
        if (FUNCTION_SCOPES.has(s.type) && !runsImmediately(s.block)) return s;
    }
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
