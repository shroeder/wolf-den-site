export const events = [
    {
        slug: "friday-night-magic",
        title: "Friday Commander Night at The Wolf Den",
        day: "Fridays",
        date: "Weekly",
        time: "4:00 PM - 7:00 PM",
        format: "Casual Commander pods, open play, trading, deck tuning, and learn-to-play support",
        entryFee: "Free",
        rsvp: "RSVP online to reserve a seat",
        capacity: "16 seats",
        seatsRemaining: "Live RSVP count",
        signupLimit: 16,
        beginnerFriendly: true,
        description:
            "Every Friday from 4:00 PM to 7:00 PM, The Wolf Den hosts a casual Commander-focused Magic: The Gathering community night in Montgomery, Minnesota.",
        rules:
            "This is currently a relaxed, community-focused environment intended to help local players connect. Bring Commander decks, trade cards, meet local MTG players, and help grow the southern Minnesota Commander community.",
        futurePlans:
            "As the community grows, future Friday events may expand into organized Commander leagues, prize-supported nights, special release events, and occasional additional MTG formats.",
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
    {
        slug: "pokemon-beginner-community-day",
        title: "Pokemon Beginner Community Day at The Wolf Den",
        day: "Saturdays",
        date: "Weekly",
        time: "2:00 PM",
        format: "Casual open-play games, trading, learning, and community hangout",
        entryFee: "Free",
        rsvp: "Discord for updates",
        capacity: "Community seating",
        seatsRemaining: "Open",
        beginnerFriendly: true,
        description:
            "Come hang out and learn Pokemon with us! Saturday at 2:00 PM, The Wolf Den hosts a relaxed, beginner-focused community event for kids, parents, and new players.",
        rules:
            "This is intentionally casual and community-driven—not a tournament or competition. Bring your own deck if you have one, but don't worry if you don't (we'll have extra decks available to learn with). Our goal is to help new players get comfortable with the game, meet other local players, and build a welcoming Pokemon community. Experienced players and staff are happy to help teach and answer questions as time allows.",
        details: {
            whatToExpect: [
                "A relaxed, no-pressure environment focused on learning and fun",
                "Casual games and trading with other players",
                "Help from experienced players if you're new to the game",
                "Opportunity to meet other Pokemon fans and new players in the community",
                "Extra decks available to learn with (no deck required)",
            ],
            whoShould: "Kids, parents, brand new players, and returning players of all experience levels. Everyone is welcome!",
            note: "We're gauging community interest and building this event based on what players want. The format may evolve as our local community grows. Parents are encouraged to stay, participate, and hang out with us.",
        },
        futurePlans:
            "As interest grows, we may expand to different formats, organized play, special events, or additional time slots based on community feedback.",
        refundPolicy:
            "No paid entry required for this event.",
    },
];

export function getEventBySlug(slug) {
    return events.find((event) => event.slug === slug);
}
