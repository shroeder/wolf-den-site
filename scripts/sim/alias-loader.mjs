// Teaches plain node the "@/" alias so the combat modules can be exercised outside Next (see sim.mjs).
// `new URL("../../src/", import.meta.url)` is already a correctly-encoded file: URL — the project path has a
// space in it, so building the string by hand double-encodes it and every import 404s on "wolf%2520den".
const SRC = new URL("../../src/", import.meta.url).href;

export function resolve(specifier, context, next) {
    // `server-only` is a Next build-time marker with no runtime behaviour — outside Next it is just a package
    // that is not installed. Stubbed so the pure catalog modules (sets, collectibles) can be exercised here.
    // Next's own package exports resolve "next/server" for its bundler; plain node needs the file.
    if (specifier === "next/server") return next("next/server.js", context);
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    // Next resolves extensionless "@/lib/db"; plain node does not, so add the .js when there is no extension.
    if (specifier.startsWith("@/")) {
        const rest = specifier.slice(2);
        const ext = /\.[a-z]+$/.test(rest) ? "" : ".js";   // extensionless imports
        return next(SRC + rest + ext, context);
    }
    return next(specifier, context);
}
