import { events } from "@/lib/events";
import { SITE_URL } from "@/lib/site";

const BASE_URL = SITE_URL;

export default function sitemap() {
    const staticRoutes = [
        {
            url: BASE_URL,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 1,
            images: [
                `${BASE_URL}/images/trading-card-store-interior-the-wolf-den-montgomery-mn.jpg`,
                `${BASE_URL}/images/local-game-store-interior-the-wolf-den-montgomery-mn.jpg`,
            ],
        },
        {
            url: `${BASE_URL}/pokemon-cards`,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.9,
            images: [
                `${BASE_URL}/images/pokemon-etbs-and-sealed-product-the-wolf-den-montgomery-mn.jpg`,
                `${BASE_URL}/images/pokemon-singles-display-case-the-wolf-den-montgomery-mn.jpg`,
            ],
        },
        {
            url: `${BASE_URL}/magic-the-gathering`,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.9,
            images: [
                `${BASE_URL}/images/magic-the-gathering-products-the-wolf-den-montgomery-mn.jpg`,
                `${BASE_URL}/images/magic-singles-case-the-wolf-den-montgomery-mn.jpg`,
            ],
        },
        {
            url: `${BASE_URL}/events`,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.9,
            images: [
                `${BASE_URL}/images/tcg-play-tables-the-wolf-den-montgomery-mn.jpg`,
                `${BASE_URL}/images/friday-night-magic-play-area-the-wolf-den-montgomery-mn.jpg`,
            ],
        },
        {
            url: `${BASE_URL}/shop`,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.8,
            images: [
                `${BASE_URL}/images/pokemon-singles-case-the-wolf-den-montgomery-mn.jpg`,
                `${BASE_URL}/images/pokemon-etbs-and-sealed-product-the-wolf-den-montgomery-mn.jpg`,
            ],
        },
        {
            url: `${BASE_URL}/looking-for`,
            lastModified: new Date(),
            changeFrequency: "daily",
            priority: 0.8,
        },
        {
            url: `${BASE_URL}/mystery-bags`,
            lastModified: new Date(),
            changeFrequency: "daily",
            priority: 0.85,
            images: [`${BASE_URL}/images/mystery_bag.jpg`],
        },
        {
            url: `${BASE_URL}/sell-cards`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.7,
            images: [`${BASE_URL}/images/magic-singles-case-the-wolf-den-montgomery-mn.jpg`],
        },
        {
            url: `${BASE_URL}/community`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.7,
            images: [`${BASE_URL}/images/tcg-play-tables-the-wolf-den-montgomery-mn.jpg`],
        },
        {
            url: `${BASE_URL}/new-players`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.7,
            images: [`${BASE_URL}/images/tcg-play-tables-the-wolf-den-montgomery-mn.jpg`],
        },
        {
            url: `${BASE_URL}/faq`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.6,
        },
        {
            url: `${BASE_URL}/contact`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.6,
        },
    ];

    const eventRoutes = events.map((event) => ({
        url: `${BASE_URL}/events/${event.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.8,
        images:
            event.slug === "friday-night-magic"
                ? [`${BASE_URL}/images/friday-night-magic-play-area-the-wolf-den-montgomery-mn.jpg`]
                : [`${BASE_URL}/images/tcg-play-tables-the-wolf-den-montgomery-mn.jpg`],
    }));

    return [...staticRoutes, ...eventRoutes];
}
