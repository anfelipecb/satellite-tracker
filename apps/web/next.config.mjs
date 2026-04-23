import path from 'path';
import { fileURLToPath } from 'url';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cesiumSource = path.join(__dirname, 'node_modules/cesium/Build/Cesium');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@satellite-tracker/shared'],
  webpack: (config, { webpack, isServer }) => {
    if (isServer) return config;

    config.plugins.push(
      new CopyWebpackPlugin({
        patterns: [
          { from: path.join(cesiumSource, 'Cesium.js'), to: path.join(__dirname, 'public/cesium/Cesium.js') },
          { from: path.join(cesiumSource, 'index.js'), to: path.join(__dirname, 'public/cesium/index.js') },
          { from: path.join(cesiumSource, 'Workers'), to: path.join(__dirname, 'public/cesium/Workers') },
          { from: path.join(cesiumSource, 'Assets'), to: path.join(__dirname, 'public/cesium/Assets') },
          { from: path.join(cesiumSource, 'ThirdParty'), to: path.join(__dirname, 'public/cesium/ThirdParty') },
          { from: path.join(cesiumSource, 'Widgets'), to: path.join(__dirname, 'public/cesium/Widgets') },
        ],
      }),
      new webpack.DefinePlugin({
        CESIUM_BASE_URL: JSON.stringify('/cesium/'),
      })
    );

    return config;
  },
};

export default nextConfig;
