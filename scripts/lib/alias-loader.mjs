// Resolves the `@/…` alias so scripts can import app modules directly. Next does this via jsconfig paths; node
// does not, and duplicating game logic into a script to work around it is how a check ends up agreeing with a
// bug. Only used by the check-* scripts.
import { pathToFileURL } from "node:url";
import path from "node:path";
const ROOT = process.cwd();
export function resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) {
        return next(pathToFileURL(path.join(ROOT, "src", specifier.slice(2))).href, context);
    }
    return next(specifier, context);
}
