// next.config.mjs

// 1) Try to load a user-provided override
let userConfig = {};
try {
  const mod = await import('./v0-user-next.config');
  userConfig = mod.default ?? {};
} catch {
  // no custom config provided
}

// 2) Helper to merge nested objects, must come *before* you call it
function mergeConfig(baseConfig, overrideConfig) {
  for (const key of Object.keys(overrideConfig)) {
    const baseVal = baseConfig[key];
    const overVal = overrideConfig[key];
    if (
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal) &&
      typeof overVal === 'object'
    ) {
      baseConfig[key] = { ...baseVal, ...overVal };
    } else {
      baseConfig[key] = overVal;
    }
  }
}

// 3) Your “base” Next config
/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
  },

  // 4) Inline your env vars at build time
  env: {
    REGION: process.env.REGION,
    ORGANIZATION_ID: process.env.ORGANIZATION_ID,
    ACCESS_KEY_ID: process.env.ACCESS_KEY_ID,
    SECRET_ACCESS_KEY: process.env.SECRET_ACCESS_KEY,
    CLOUDSERVICES_TABLE_NAME:
      process.env.CLOUDSERVICES_TABLE_NAME ||
      process.env.CLOUDSERVICES_TABLE,
    COGNITO_USERPOOL_ID: process.env.COGNITO_USERPOOL_ID,
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    COGNITO_CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET,
    COGNITO_REDIRECT_URI: process.env.COGNITO_REDIRECT_URI,
    COGNITO_LOGOUT_URI: process.env.COGNITO_LOGOUT_URI,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },

  // 5) Route API calls to remote backend by default
  // Put the specific /api/auth route first so it stays local
  async rewrites() {
    return [
      {
        source: '/api/auth/:path*',
        destination: '/api/auth/:path*',
      },
      {
        source: '/api/user/:path*',
        destination: '/api/user/:path*',
      },
      {
        source: '/api/:path*',
        destination: 'https://backend.console-encryptgate.net/api/:path*',
      },
    ];
  },

  // 6) No redirects needed for landing page
  async redirects() {
    return [];
  },
};

// 7) Merge in any user-provided overrides
mergeConfig(nextConfig, userConfig);

// 8) Export it
export default nextConfig;
