import { parcelEstimate } from "@/lib/shipping/easypost";
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

// ── ⚠️ EVERY PRODUCT GETS A GOOGLE CATEGORY, NOT JUST THE ONES WITH A BRAND ─────────────────────────────────
// google_product_category was written as `brand ? <category> : ""` — tied to whether cardBrandFor happened
// to recognise the Square category. Measured on the live feed: 1,561 of 1,984 items had one and 423 did not,
// and the 423 are the paintings, the plushes, the comics and the figures. Google uses this to decide which
// surfaces and formats an item is eligible for, so a missing one is a product competing with one hand tied.
//
// ⚠️ THE TAXONOMY PATHS ARE GOOGLE'S OWN WORDING. They are matched as text, so "Collectible Trading Cards"
// has to be exactly that — a near-miss is silently ignored and the item falls back to uncategorised, which
// is the state this is fixing. First match wins, so the specific rows sit above the general ones.
const GOOGLE_CATEGORIES = [
    // ⚠️ WORD BOUNDARIES, AND THEY ARE NOT DECORATION. The first cut matched /tin/ for a Pokemon tin —
    // and "Pain-TIN-g" contains it, so all 99 of Pedro's paintings were filed as card games. Measured, not
    // spotted: the category spread showed 3 artworks where there should have been 102. Any keyword short
    // enough to live inside another word needs bounding. [[duplicates-are-the-normal-case]] is the same
    // family — a matcher that looks right until you count what it actually caught.
    // Loose singles are collectibles, not a card GAME — Google separates the two and the buyer intent is
    // completely different: somebody searching a card name is collecting, not looking for something to play.
    { re: /single|\bcards\b/i, path: "Arts &amp; Entertainment &gt; Hobbies &amp; Creative Arts &gt; Collectibles &gt; Collectible Trading Cards" },
    { re: /sealed|booster|\bpack\b|\bdeck\b|\btin\b|\bbox\b/i, path: GOOGLE_CARD_CATEGORY },
    { re: /plush/i, path: "Toys &amp; Games &gt; Toys &gt; Stuffed Animals" },
    { re: /figure/i, path: "Toys &amp; Games &gt; Toys &gt; Action Figures" },
    { re: /comic/i, path: "Media &gt; Books" },
    { re: /painting|\bart\b/i, path: "Home &amp; Garden &gt; Decor &gt; Artwork &gt; Posters, Prints, &amp; Visual Artwork" },
    { re: /drink|food|soda/i, path: "Food, Beverages &amp; Tobacco &gt; Beverages" },
    { re: /accessor|sleeve|binder|toploader/i, path: "Arts &amp; Entertainment &gt; Hobbies &amp; Creative Arts &gt; Collectibles &gt; Collectible Trading Cards" },
];

// ⚠️ THE DEFAULT IS THE SHOP'S OWN ANSWER, NOT A BLANK. Several Square categories are a person's NAME —
// "Eric D", "Justin's cards", "Pedro Painting" — because that is how consignment is filed at the counter.
// Those are the 131, 83 and 99 item rows, and none of them can be matched by a word. Falling back to
// collectible trading cards is right far more often than it is wrong here, and an item with a slightly
// broad category outranks an item with none at all.
const GOOGLE_CATEGORY_DEFAULT = "Arts &amp; Entertainment &gt; Hobbies &amp; Creative Arts &gt; Collectibles &gt; Collectible Trading Cards";

function googleCategoryFor(categoryNames, name) {
    const label = `${categoryNames.join(" ")} ${name}`;
    return (GOOGLE_CATEGORIES.find((c) => c.re.test(label)) || { path: GOOGLE_CATEGORY_DEFAULT }).path;
}

// ── PRODUCT TYPE — THE SHOP'S OWN SHELF, NOT GOOGLE'S ───────────────────────────────────────────────────────
// Google reads google_product_category; product_type is the merchant's own taxonomy and is what Shopping
// campaigns are segmented by. It was absent entirely, which means every campaign has to target the whole
// catalogue or nothing. The Square category IS the shelf the item sits on, so it is the honest value.
function productTypeFor(categoryNames) {
    return categoryNames.filter(Boolean).join(" &gt; ");
}

// ── ⚠️ CUSTOM LABELS ARE FOR BIDDING, AND THEY HAVE TO BE COARSE ───────────────────────────────────────────
// A label with 1,984 distinct values is not a label. Two that are actually useful: what KIND of thing it is,
// and what it COSTS — the two axes a card shop would ever bid differently on. A $2 single and a $180 booster
// display do not belong in the same ad group, and until now nothing in the feed could tell them apart.
function priceBand(price) {
    if (price < 5) return "under-5";
    if (price < 20) return "5-20";
    if (price < 50) return "20-50";
    if (price < 150) return "50-150";
    return "150-plus";
}

function kindFor(categoryNames, name) {
    const label = `${categoryNames.join(" ")} ${name}`;
    if (/single/i.test(label)) return "single";
    if (/sealed|booster|\bpack\b|\bdeck\b|\btin\b|\bbox\b/i.test(label)) return "sealed";
    if (/plush|figure/i.test(label)) return "collectible";
    if (/comic/i.test(label)) return "comic";
    if (/painting|\bart\b/i.test(label)) return "art";
    if (/accessor|sleeve|binder|toploader/i.test(label)) return "accessory";
    return "other";
}

// ── ⚠️ SHIPPING WEIGHT, FROM THE SAME ESTIMATOR THAT QUOTES THE REAL LABEL ──────────────────────────────────
// Google Merchant Center, 2026-11-12: 1,820 products — 92.7% of the feed — blocked from showing in the US
// for a missing [shipping_weight]. Every one of them is a product that could not appear in a search result.
//
// ⚠️ IT IS NOT A NEW GUESS. src/lib/shipping/easypost.js already estimates what a parcel weighs, per item,
// from the item's name, its Square category and its price — and that estimate is the one the shop BILLS
// against: it is what EasyPost is handed when a customer buys. A second table of weights invented here
// would be a second answer to "what does this weigh", and the two would drift the first time either was
// tuned. [[balance-constants-never-copied]]
//
// ⚠️ ONE UNIT, IN A BOX, WHICH IS WHAT THE ATTRIBUTE MEANS. parcelEstimate takes a basket, so it is handed
// a basket of one. That includes the packaging weight and the safety factor, because a shipping weight that
// excludes the box is a number nobody can post anything at — and Google uses this to quote the shopper.
//
// ⚠️ AND IT IS DECLARED IN OUNCES. The estimator works in oz throughout; converting to pounds here would
// round a 3 oz single to 0.19 lb and hand Google a figure with more precision than the estimate has.
function shippingWeightOz(item) {
    const estimate = parcelEstimate([{
        name: item.name,
        // estimateUnit matches on category + name as one string; the feed carries a list.
        categoryName: (item.categoryNames || []).join(" "),
        // Price is the fallback signal for anything the name and category do not recognise, and it is the
        // one that catches sealed product. The feed stores dollars.
        priceCents: Math.round(Number(item.price || 0) * 100),
        quantity: 1,
    }]);
    // A whole ounce. The estimate is not precise enough to pretend otherwise, and Google is happy with it.
    return Math.max(1, Math.round(estimate.weight));
}

// Loose singles are second-hand (no original packaging) -> "used"; everything else -> "new".
function conditionFor(categoryNames) {
    return /single/i.test(categoryNames.join(" ")) ? "used" : "new";
}

// ── ⚠️ BRAND READS THE NAME AS WELL AS THE CATEGORY ─────────────────────────────────────────────────────────
// This only ever looked at the Square category, and the category is frequently a PERSON — "Eric D",
// "Justin's cards", "Josh comics" — because that is how consignment is filed at the counter. Measured:
// 423 of 1,984 items had no brand, and 29 of them named their game in the title while the category said
// nothing at all. The same sweep found whole classes with obvious publishers: comics, consoles and drinks.
//
// ⚠️ THE LIST IS KEYWORDS, NOT SKUs, AND THAT IS THE REQUIREMENT. Luke: "Ensure downstream when we board
// more items they too are fixed going forward." Nothing in this file enumerates a product — every rule
// reads the name and category of whatever Square happens to be holding, at the moment the feed is
// rendered. A row boarded tomorrow is categorised, weighed, labelled, grouped and branded by the same
// rules with nobody doing anything. An allow-list of ids would have been the version that rots.
const BRANDS = [
    { re: /pok[eé]mon|charizard|pikachu|eevee|umbreon|sylveon|snorlax|mewtwo/i, brand: "Pokémon" },
    { re: /yu-?gi-?oh|blue-eyes|dark magician/i, brand: "Yu-Gi-Oh!" },
    { re: /\bmagic\b|\bmtg\b|planeswalker/i, brand: "Magic: The Gathering" },
    { re: /one piece/i, brand: "One Piece Card Game" },
    { re: /\bdbz\b|dragon ball/i, brand: "Dragon Ball Super" },
    { re: /final fantasy/i, brand: "Final Fantasy TCG" },
    { re: /lorcana/i, brand: "Disney Lorcana" },
    { re: /star trek|klingon|\bborg\b/i, brand: "Star Trek" },
    { re: /marvel|spider-?man|x-men|avengers/i, brand: "Marvel" },
    { re: /\bdc\b|superman|batman|justice league|wonder woman/i, brand: "DC Comics" },
    { re: /nintendo|game ?boy|\bwii\b|\bn64\b/i, brand: "Nintendo" },
    { re: /playstation|\bps[1-5]\b/i, brand: "Sony" },
    { re: /\bxbox\b/i, brand: "Microsoft" },
    { re: /mountain dew|\bpepsi\b/i, brand: "PepsiCo" },
    { re: /coca-?cola|\bcoke\b|\bsprite\b/i, brand: "Coca-Cola" },
    { re: /fortnite/i, brand: "Fortnite" },
    // Last, and deliberately vague: a sealed thing we cannot name is still a trading card product, which
    // is a better answer for Google than no brand at all.
    { re: /\bsealed\b|booster/i, brand: "Trading Card Game" },
];

function cardBrandFor(categoryNames, name = "") {
    const label = `${categoryNames.join(" ")} ${name}`;
    return (BRANDS.find((b) => b.re.test(label)) || { brand: null }).brand;
}

// ── ⚠️ THE SAME CARD LISTED TWICE IS A VARIANT, NOT A DUPLICATE ─────────────────────────────────────────────
// 248 rows share a title with another row — a shop with three copies of one Magic single at $28, $26 and
// $26 has three Square variations and three feed rows. Rewriting those titles to force them apart would be
// inventing differences that do not exist. item_group_id is the attribute Google has for exactly this, and
// it lets the three compete as ONE product with a price range rather than as three near-identical listings
// that look like a merchant padding the feed.
//
// ⚠️ DERIVED FROM THE NAME, so it is stable across syncs and needs nothing stored. Two rows group if and
// only if they are the same product by name, which is the test a human at the counter would use.
function itemGroupId(name) {
    return String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50) || null;
}

// ── ⚠️ THE TITLE IS WHAT GOOGLE MATCHES A SEARCH AGAINST ────────────────────────────────────────────────────
// 438 titles were under 25 characters — "Charizard Binder", "Pepsi" — because a Square name is written for
// somebody standing at the counter who can already see the thing. A shopper typing into Google cannot.
//
// ⚠️ IT PREFIXES, IT NEVER REWRITES. The Square name stays exactly as it is and the brand goes in front of
// it, and only when the name does not already say it. That keeps every match the feed already earns while
// adding the word people actually search with. Anything cleverer — reordering, injecting set names,
// stuffing keywords — risks losing matches that work today, and Google penalises the stuffed version.
function titleFor(name, brand) {
    const clean = String(name || "").trim();
    if (!brand) return clean;
    const bare = brand.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const already = clean.replace(/[^a-z0-9]/gi, "").toLowerCase().includes(bare);
    return already ? clean : `${brand} ${clean}`;
}

// ── ⚠️ A DESCRIPTION THAT SAYS SOMETHING ────────────────────────────────────────────────────────────────────
// Every item carried the same sentence: "<name> — <categories>. In stock at The Wolf Den in Montgomery, MN."
// True, and it told a shopper nothing they could not see from the title. This says what KIND of thing it is
// and, for a single, that it is a real second-hand card rather than sealed product — which is the question
// anybody buying a single actually has.
const KIND_SENTENCE = {
    single: "A single trading card, pulled and sleeved in store.",
    sealed: "Sealed product, exactly as it comes from the manufacturer.",
    collectible: "A collectible, in store and ready to ship.",
    comic: "A back-issue comic from our shelves.",
    art: "Original artwork, one of one.",
    accessory: "Protection and storage for your collection.",
    other: "In store and ready to ship.",
};

function descriptionFor(item, kind, brand) {
    const parts = [
        brand && kind !== "art" ? `${brand}.` : null,
        KIND_SENTENCE[kind] || KIND_SENTENCE.other,
        item.categoryNames.length ? `Filed under ${item.categoryNames.join(", ")}.` : null,
        "Shipped from The Wolf Den in Montgomery, Minnesota, or collect it free in store.",
    ];
    return `${item.name} — ${parts.filter(Boolean).join(" ")}`;
}

export async function GET() {
    const items = await listShopFeedItems().catch(() => []);

    const itemsXml = items
        .map((item) => {
            const link = `${SITE_URL}/shop/${productHandle(item.name, item.variationId)}`;
            const brand = cardBrandFor(item.categoryNames, item.name);
            const productType = productTypeFor(item.categoryNames);
            const kind = kindFor(item.categoryNames, item.name);
            const description = descriptionFor(item, kind, brand);
            const groupId = itemGroupId(item.name);

            return [
                "    <item>",
                `      <g:id>${esc(item.variationId)}</g:id>`,
                `      <g:title>${esc(titleFor(item.name, brand)).slice(0, 150)}</g:title>`,
                `      <g:description>${esc(description).slice(0, 4000)}</g:description>`,
                `      <g:link>${esc(link)}</g:link>`,
                `      <g:image_link>${esc(item.imageUrl)}</g:image_link>`,
                "      <g:availability>in_stock</g:availability>",
                `      <g:price>${item.price.toFixed(2)} USD</g:price>`,
                `      <g:shipping_weight>${shippingWeightOz(item)} oz</g:shipping_weight>`,
                `      <g:condition>${conditionFor(item.categoryNames)}</g:condition>`,
                "      <g:identifier_exists>no</g:identifier_exists>",
                brand ? `      <g:brand>${esc(brand)}</g:brand>` : "",
                // ⚠️ NO LONGER GATED ON THE BRAND. See GOOGLE_CATEGORIES — 423 items had no category at
                // all because they had no recognisable card brand, which is a different question entirely.
                `      <g:google_product_category>${googleCategoryFor(item.categoryNames, item.name)}</g:google_product_category>`,
                productType ? `      <g:product_type>${esc(productType)}</g:product_type>` : "",
                `      <g:custom_label_0>${esc(kind)}</g:custom_label_0>`,
                // ⚠️ GROUPED, NOT DEDUPED — three copies of one single are one product with three prices.
                groupId ? `      <g:item_group_id>${esc(groupId)}</g:item_group_id>` : "",
                `      <g:custom_label_1>${esc(priceBand(Number(item.price) || 0))}</g:custom_label_1>`,
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
