/** @type {import('next').NextConfig} */
const nextConfig = {
    trailingSlash: false,
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
