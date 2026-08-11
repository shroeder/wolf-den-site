// Resolves the `@/…` alias so scripts can import app modules directly. Next does this via jsconfig paths; node
// does not, and duplicating game logic into a script to work around it is how a check ends up agreeing with a
// bug. Only used by the check-* scripts.
import { pathToFileURL } from "node:url";
import path from "node:path";
const ROOT = process.cwd();
// `server-only` is a Next build-time guard with no runtime behaviour and no entry in node_modules — importing
// a module that declares it (sets.js, items.js, anything server-side) blows up a script that only wants to
// read its data tables. Resolved to an empty module so a check can inspect server-side source without the
// alternative, which is copying the table into the script and having the check agree with itself.
const EMPTY = "data:text/javascript,";

export function resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: EMPTY, shortCircuit: true };
    if (specifier.startsWith("@/")) {
        // Next resolves an extensionless alias ("@/lib/db") against the file on disk; node will not, so the
        // extension is added here when the bare path has none.
        const target = path.join(ROOT, "src", specifier.slice(2));
        const withExt = path.extname(target) ? target : `${target}.js`;
        return next(pathToFileURL(withExt).href, context);
    }
    return next(specifier, context);
}
