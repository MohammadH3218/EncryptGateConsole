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
    AWS_REGION: process.env.AWS_REGION,
    ORGANIZATION_ID: process.env.ORGANIZATION_ID,
    ACCESS_KEY_ID: process.env.ACCESS_KEY_ID,
    SECRET_ACCESS_KEY: process.env.SECRET_ACCESS_KEY,
    CLOUDSERVICES_TABLE_NAME:
      process.env.CLOUDSERVICES_TABLE_NAME ||
      process.env.CLOUDSERVICES_TABLE,
    DETECTIONS_TABLE_NAME: process.env.DETECTIONS_TABLE_NAME,
    EMAILS_TABLE_NAME: process.env.EMAILS_TABLE_NAME,
    EMPLOYEES_TABLE_NAME: process.env.EMPLOYEES_TABLE_NAME,
    USERS_TABLE_NAME: process.env.USERS_TABLE_NAME,
    ORGANIZATIONS_TABLE_NAME: process.env.ORGANIZATIONS_TABLE_NAME,
    COGNITO_USERPOOL_ID: process.env.COGNITO_USERPOOL_ID,
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    COGNITO_CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET,
    COGNITO_REDIRECT_URI: process.env.COGNITO_REDIRECT_URI,
    COGNITO_LOGOUT_URI: process.env.COGNITO_LOGOUT_URI,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
    FRONTEND_URL: process.env.FRONTEND_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_URL: process.env.OPENAI_URL,
    NEO4J_URI: process.env.NEO4J_URI,
    NEO4J_USER: process.env.NEO4J_USER,
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD,
    NEO4J_ENCRYPTED: process.env.NEO4J_ENCRYPTED,
  },

  // 5) Route API calls - support local development mode
  // In local dev mode (LOCAL_DEV=true), route to local Flask backend
  // Otherwise, route to remote backend
  async rewrites() {
    const isLocalDev = process.env.LOCAL_DEV === 'true' || process.env.NODE_ENV === 'development';
    const localBackendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    
    // If local dev mode, route most API calls to local Flask backend
    // But keep Next.js API routes local (orgs, auth, user)
    if (isLocalDev) {
      console.log('🔧 Local development mode: Routing API calls to', localBackendUrl);
      return [
        // Keep Next.js API routes local (these handle DynamoDB directly)
        {
          source: '/api/orgs/:path*',
          destination: '/api/orgs/:path*',
        },
        {
          source: '/api/auth/:path*',
          destination: '/api/auth/:path*',
        },
        {
          source: '/api/user/:path*',
          destination: '/api/user/:path*',
        },
        // Route everything else to Flask backend
        {
          source: '/api/:path*',
          destination: `${localBackendUrl}/api/:path*`,
        },
      ];
    }
    
    // Production mode: Route to remote backend, but keep some routes local
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
        source: '/api/orgs/:path*',
        destination: '/api/orgs/:path*',
      },
      {
        source: '/api/email/:path*',
        destination: '/api/email/:path*',
      },
      {
        source: '/api/investigations/:path*',
        destination: '/api/investigations/:path*',
      },
      {
        source: '/api/investigate/:path*',
        destination: '/api/investigate/:path*',
      },
      {
        source: '/api/test-neo4j-connection',
        destination: '/api/test-neo4j-connection',
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
