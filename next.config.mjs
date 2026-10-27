/** @type {import('next').NextConfig} */
const nextConfig = {
    // The deployment this bundle was built as. A long-lived tab whose chunks all still exist can be several
    // deploys behind and keep crashing on code that was fixed hours ago (see recoverFromStaleBuild) — comparing
    // this against /api/build-id is how the client finds that out.
    env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_DEPLOYMENT_ID || "dev" },
    trailingSlash: false,
    // ⚠️ THE HOUSE DESIGN SHEET IS READ OFF DISK AT RUNTIME, SO IT HAS TO BE TRACED IN.
    // image-model.js reads public/images/art/house-design-sheet.png with a path built at runtime, and Next's
    // file tracer only follows paths it can see statically — so without this the file is simply absent in the
    // deployed function and every sprite silently loses its style reference. houseStyleSheet() returns null
    // rather than throwing in that case, which means the failure looks like "the art went back to being wrong"
    // and nothing else. Name it explicitly.
    outputFileTracingIncludes: {
        "/**": ["./public/images/art/house-design-sheet.png"],
    },
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
            { source: '/alerts', destination: '/shop', permanent: true },
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
