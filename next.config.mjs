/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the Postgres driver out of the bundle (it's only loaded at runtime in
  // production via a dynamic import); avoids webpack trying to resolve it.
  experimental: {
    serverComponentsExternalPackages: ["pg", "@sparticuz/chromium", "puppeteer-core"],
  },
  webpack: (config, { dev }) => {
    // The project lives in a OneDrive-synced folder, which locks/renames the
    // webpack cache files and corrupts the build. Disable the filesystem cache
    // in dev for reliability.
    if (dev) config.cache = false;
    return config;
  },
};

export default nextConfig;
