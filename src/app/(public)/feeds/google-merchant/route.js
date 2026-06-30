import { listShopFeedItems } from "@/lib/inventory-feed/feed";
import { productHandle } from "@/lib/inventory-feed/product-url";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
// Regenerate hourly; Merchant Center fetches on its own schedule.
export const revalidate = 3600;

function esc(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

const GOOGLE_CARD_CATEGORY = "Toys &amp; Games &gt; Games &gt; Card Games";

// Loose singles are second-hand (no original packaging) -> "used"; everything else -> "new".
function conditionFor(categoryNames) {
    return /single/i.test(categoryNames.join(" ")) ? "used" : "new";
}

// Best-effort brand + "is this a card game item" from the Square category name.
function cardBrandFor(categoryNames) {
    const j = categoryNames.join(" ").toLowerCase();
    if (j.includes("pokemon") || j.includes("pokémon")) return "Pokémon";
    if (j.includes("magic")) return "Magic: The Gathering";
    if (j.includes("yu-gi-oh") || j.includes("yugioh")) return "Yu-Gi-Oh!";
    if (j.includes("one piece")) return "One Piece Card Game";
    if (j.includes("dbz") || j.includes("dragon ball")) return "Dragon Ball Super";
    if (j.includes("final fantasy")) return "Final Fantasy TCG";
    if (j.includes("lorcana")) return "Disney Lorcana";
    if (/\bsealed\b|booster/i.test(categoryNames.join(" "))) return "Trading Card Game";
    return null;
}

export async function GET() {
    const items = await listShopFeedItems().catch(() => []);

    const itemsXml = items
        .map((item) => {
            const link = `${SITE_URL}/shop/${productHandle(item.name, item.variationId)}`;
            const brand = cardBrandFor(item.categoryNames);
            const description = `${item.name}${item.categoryNames.length ? ` — ${item.categoryNames.join(", ")}` : ""}. In stock at The Wolf Den in Montgomery, MN.`;

            return [
                "    <item>",
                `      <g:id>${esc(item.variationId)}</g:id>`,
                `      <g:title>${esc(item.name).slice(0, 150)}</g:title>`,
                `      <g:description>${esc(description).slice(0, 4000)}</g:description>`,
                `      <g:link>${esc(link)}</g:link>`,
                `      <g:image_link>${esc(item.imageUrl)}</g:image_link>`,
                "      <g:availability>in_stock</g:availability>",
                `      <g:price>${item.price.toFixed(2)} USD</g:price>`,
                `      <g:condition>${conditionFor(item.categoryNames)}</g:condition>`,
                "      <g:identifier_exists>no</g:identifier_exists>",
                brand ? `      <g:brand>${esc(brand)}</g:brand>` : "",
                brand ? `      <g:google_product_category>${GOOGLE_CARD_CATEGORY}</g:google_product_category>` : "",
                "    </item>",
            ]
                .filter(Boolean)
                .join("\n");
        })
        .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>The Wolf Den — In-Stock Inventory</title>
    <link>${SITE_URL}</link>
    <description>Trading cards, sealed product, and accessories in stock at The Wolf Den in Montgomery, MN.</description>
${itemsXml}
  </channel>
</rss>`;

    return new Response(xml, {
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
    });
}
