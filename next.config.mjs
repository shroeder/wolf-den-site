/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/discord',
        destination: 'https://discord.gg/Pad8U2KVsD',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
