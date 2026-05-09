export const events = [
    {
        slug: "pokemon-league-night",
        title: "Pokémon League Night",
        date: "Coming Soon",
        time: "6:00 PM",
        format: "Casual + Swiss",
        entryFee: "Free",
        rsvp: "Discord RSVP",
        capacity: "24 players",
        seatsRemaining: "TBD",
        beginnerFriendly: true,
        description:
            "A welcoming weekly Pokémon night with casual pods and a beginner table. Dates and times will be announced on Discord.",
        rules:
            "Standard Play! Pokemon League structure with casual pods first, then Swiss rounds when attendance supports it.",
        prizeSupport:
            "Promo packs and participation support while supplies last.",
        refundPolicy:
            "No paid entry required for this event.",
    },
    {
        slug: "fnm-modern",
        title: "Friday Night Magic: Modern",
        date: "Coming Soon",
        time: "6:30 PM",
        format: "Modern",
        entryFee: "Free",
        rsvp: "Discord RSVP recommended",
        capacity: "20 players",
        seatsRemaining: "TBD",
        beginnerFriendly: false,
        description:
            "Weekly competitive Modern event for experienced players. Watch Discord for scheduling updates.",
        rules:
            "Swiss rounds based on attendance with current MTG Comprehensive Rules and ban list.",
        prizeSupport:
            "Store credit payout based on attendance and final standings.",
        refundPolicy:
            "If a paid version of the event is posted later, refunds are available up to event start time.",
    },
    {
        slug: "fnm-draft-night",
        title: "Friday Night Magic: Draft Night",
        date: "Coming Soon",
        time: "6:30 PM",
        format: "Booster Draft",
        entryFee: "$20",
        rsvp: "Discord RSVP required",
        capacity: "16 players",
        seatsRemaining: "TBD",
        beginnerFriendly: true,
        description:
            "Our typical Magic event night is Draft Night: build from fresh packs, play three Swiss rounds, and learn in a friendly but competitive environment.",
        rules:
            "Each player drafts three Play Boosters, builds a 40-card deck, and plays Swiss rounds. Basic lands are provided.",
        prizeSupport:
            "Participation booster plus additional prizes based on standings and attendance.",
        refundPolicy:
            "Refunds available until 24 hours before event start. After that, store credit only.",
    },
    {
        slug: "sunday-family-open-play",
        title: "Sunday Family Open Play",
        date: "Coming Soon",
        time: "1:00 PM",
        format: "Open tables",
        entryFee: "Free",
        rsvp: "Walk-ins welcome",
        capacity: "Open seating",
        seatsRemaining: "Open",
        beginnerFriendly: true,
        description:
            "Bring the family, learn games, and trade in a relaxed environment. Details coming soon.",
        rules:
            "Casual community play with staff support for basic rules and event etiquette.",
        prizeSupport:
            "Occasional door prizes and promo items during special family sessions.",
        refundPolicy:
            "No paid entry required for this event.",
    },
];

export function getEventBySlug(slug) {
    return events.find((event) => event.slug === slug);
}
