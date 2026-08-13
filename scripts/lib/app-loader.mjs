// ── RUN THE APP'S OWN CODE FROM A SCRIPT ─────────────────────────────────────────────────────────────────────
// A Node resolve hook that teaches plain `node` two things the Next build normally handles:
//
//   1. `@/…` means `src/…`
//   2. `server-only` is a no-op (it exists to blow up if a server module reaches a client bundle; there is no
//      client bundle here, and letting it throw would block every module worth reading)
//
// Why bother: stats in this game are assembled from six places — base items, set bonuses, the compendium,
// forge enhancement, socketed gems, then pets and badges on top. Reimplementing that in a reporting script
// means a second copy that disagrees with the game the first time any of the six changes, which is the exact
// failure this codebase keeps having. Import the real functions instead and the report cannot drift.
import { pathToFileURL } from "node:url";
import path from "node:path";
import { existsSync, statSync } from "node:fs";

const SRC = pathToFileURL(path.resolve(process.cwd(), "src") + path.sep).href;

export async function resolve(specifier, context, next) {
    if (specifier === "server-only" || specifier === "client-only") {
        return { url: new URL("./noop-module.mjs", import.meta.url).href, shortCircuit: true };
    }
    // Next's own runtime modules. Reached only because a couple of library files import NextResponse or
    // headers() at module scope for the request paths; none of the stat code calls them, so a stub with the
    // right SHAPE is enough and avoids dragging the framework into a reporting script.
    if (specifier === "next/server" || specifier === "next/headers" || specifier === "next/cache") {
        return { url: new URL("./next-stub.mjs", import.meta.url).href, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
        // Extensionless imports are the norm in the app ("@/lib/db"), and Node will not guess an extension
        // the way a bundler does — so try the candidates a bundler would, in the same order.
        const base = path.resolve(process.cwd(), "src", specifier.slice(2));
        for (const cand of [base, `${base}.js`, `${base}.mjs`, path.join(base, "index.js")]) {
            if (existsSync(cand) && statSync(cand).isFile()) {
                return { url: pathToFileURL(cand).href, shortCircuit: true };
            }
        }
        return next(SRC + specifier.slice(2), context);
    }
    return next(specifier, context);
}
