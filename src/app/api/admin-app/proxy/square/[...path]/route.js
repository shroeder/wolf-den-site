import { handleProxy } from "@/lib/admin-app/proxy";

export const runtime = "nodejs";

const handler = (request, context) => handleProxy(request, "square", context);

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
