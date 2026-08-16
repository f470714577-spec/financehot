/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@financehot/db', '@financehot/shared', '@financehot/ui'],
};

export default nextConfig;
