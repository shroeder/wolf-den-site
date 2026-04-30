export const events = [
    {
        slug: "pokemon-league-night",
        title: "Pokémon League Night",
        date: "Coming Soon",
        format: "Casual + Swiss",
        entryFee: "Free",
        beginnerFriendly: true,
        description:
            "A welcoming weekly Pokémon night with casual pods and a beginner table. Dates and times will be announced on Discord.",
    },
    {
        slug: "fnm-modern",
        title: "Friday Night Magic: Modern",
        date: "Coming Soon",
        format: "Modern",
        entryFee: "Free",
        beginnerFriendly: false,
        description:
            "Weekly competitive Modern event for experienced players. Watch Discord for scheduling updates.",
    },
    {
        slug: "sunday-family-open-play",
        title: "Sunday Family Open Play",
        date: "Coming Soon",
        format: "Open tables",
        entryFee: "Free",
        beginnerFriendly: true,
        description:
            "Bring the family, learn games, and trade in a relaxed environment. Details coming soon.",
    },
];

export function getEventBySlug(slug) {
    return events.find((event) => event.slug === slug);
}
