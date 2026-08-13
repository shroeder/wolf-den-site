// Shape-only stand-ins for Next's runtime modules, so server libraries import cleanly under plain node.
// Anything that actually CALLS these is a request path, which a reporting script never enters.
export class NextResponse {
    static json(body, init) { return { body, init }; }
}
export const cookies = () => ({ get: () => undefined, getAll: () => [], set: () => {} });
export const headers = () => new Map();
export const revalidatePath = () => {};
export const revalidateTag = () => {};
export const unstable_cache = (fn) => fn;
