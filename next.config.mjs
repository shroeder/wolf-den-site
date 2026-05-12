/** @type {import('next').NextConfig} */
const nextConfig = {
    trailingSlash: false,
    async redirects() {
        return [
            {
                source: '/discord',
                destination: 'https://discord.gg/Pad8U2KVsD',
                permanent: false,
            },
            // Redirect www to non-www
            {
                source: '/:path*',
                destination: 'https://wolfdengamingmn.com/:path*',
                has: [
                    {
                        type: 'host',
                        value: 'www.wolfdengamingmn.com',
                    },
                ],
                permanent: true,
            },
        ];
    },
};

export default nextConfig;
