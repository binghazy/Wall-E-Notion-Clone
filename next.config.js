/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["files.edgestore.dev"],
  },
  webpack: (config) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      /autoprefixer: start value has mixed support, consider using flex-start instead/,
    ];
    config.infrastructureLogging = {
      ...(config.infrastructureLogging ?? {}),
      level: "error",
    };

    return config;
  },
};

module.exports = nextConfig;
