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
