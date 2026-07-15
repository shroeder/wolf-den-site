import { redirect } from "next/navigation";

// Just In was folded into Shop (it's the default "Just In" view there). Keep the URL working — redirect
// any old links / bookmarks to the shop.
export const dynamic = "force-dynamic";

export default function JustInPage() {
    redirect("/shop");
}
