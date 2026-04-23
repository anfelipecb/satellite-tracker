import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@satellite-tracker/shared'],
  webpack: (config, { webpack, isServer }) => {
    if (isServer) return config;

    config.plugins.push(
      new webpack.DefinePlugin({
        CESIUM_BASE_URL: JSON.stringify('/cesium/'),
      })
    );

    return config;
  },
};

export default nextConfig;
