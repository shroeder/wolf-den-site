export const events = [
    {
        slug: "friday-night-magic",
        title: "Friday Night Magic at The Wolf Den",
        day: "Fridays",
        date: "Weekly",
        time: "4:00 PM - 8:00 PM",
        format: "Casual Commander, open play, trading, pack battles, and learn-to-play support",
        entryFee: "Free",
        rsvp: "Discord for updates",
        capacity: "Community seating",
        seatsRemaining: "Open",
        beginnerFriendly: true,
        description:
            "Every Friday evening, The Wolf Den hosts a casual Magic: The Gathering community night in Montgomery, Minnesota.",
        rules:
            "This is currently a relaxed, community-focused environment intended to help local players connect. Bring Commander decks, trade cards, meet local MTG players, and help grow the southern Minnesota Magic community.",
        futurePlans:
            "As the community grows, future Friday events may expand into draft nights, organized Commander events, prize-supported events, special release events, and additional MTG formats.",
        refundPolicy:
            "No paid entry required for this event.",
    },
    {
        slug: "pokemon-community-saturday",
        title: "Pokemon Community Saturdays at The Wolf Den",
        day: "Saturdays",
        date: "Weekly",
        time: "12:00 PM - 6:00 PM",
        format: "Casual Pokemon gameplay, trading cards, pack battles, collection discussions, and learn-to-play opportunities",
        entryFee: "Free",
        rsvp: "Discord for updates",
        capacity: "Community seating",
        seatsRemaining: "Open",
        beginnerFriendly: true,
        description:
            "Every Saturday, The Wolf Den hosts a Pokemon-focused community event in Montgomery, Minnesota for collectors, players, families, and fans of all ages.",
        rules:
            "The focus right now is growing a fun and welcoming local Pokemon community. Whether you are brand new to Pokemon, returning after years away, a collector, or an experienced player, you are welcome at The Wolf Den.",
        futurePlans:
            "As the local community grows, future Pokemon events may include organized tournaments, league-style play, special set release events, trade nights, and community challenges.",
        refundPolicy:
            "No paid entry required for this event.",
    },
];

export function getEventBySlug(slug) {
    return events.find((event) => event.slug === slug);
}
