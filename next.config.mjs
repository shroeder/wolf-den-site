/** @type {import('next').NextConfig} */
const nextConfig = {
    trailingSlash: false,
    images: {
        remotePatterns: [
            // tcgcsv product imagery (the "Looking For" card thumbnails) is served from
            // tcgplayer's image CDNs.
            { protocol: "https", hostname: "tcgplayer-cdn.tcgplayer.com" },
            { protocol: "https", hostname: "product-images.tcgplayer.com" },
        ],
    },
    async rewrites() {
        return [
            // Serve the Android App Links verification file (public/ dot-folders aren't served).
            { source: "/.well-known/assetlinks.json", destination: "/api/assetlinks" },
        ];
    },
    async redirects() {
        return [
            // Consolidated into /about (concise combined page); Just In folded into /shop.
            { source: '/pokemon-cards', destination: '/about#games', permanent: true },
            { source: '/magic-the-gathering', destination: '/about#games', permanent: true },
            { source: '/community', destination: '/about#community', permanent: true },
            { source: '/new-players', destination: '/about#new-players', permanent: true },
            { source: '/faq', destination: '/about#faq', permanent: true },
            { source: '/contact', destination: '/about#contact', permanent: true },
            { source: '/just-in', destination: '/shop', permanent: true },
            { source: '/get-offers', destination: '/sell-cards', permanent: true },
            {
                source: '/:path*',
                has: [
                    {
                        type: 'header',
                        key: 'host',
                        value: 'wolfdengamingmn.com',
                    },
                ],
                destination: 'https://www.wolfdengamingmn.com/:path*',
                permanent: true,
            },
            {
                source: '/discord',
                destination: 'https://discord.gg/Pad8U2KVsD',
                permanent: false,
            },
        ];
    },
};

export default nextConfig;
