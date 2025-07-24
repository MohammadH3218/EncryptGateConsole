let userConfig = undefined;
try {
  userConfig = await import('./v0-user-next.config');
} catch (e) {
  // ignore error
}

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
  // Add server runtime config to expose env vars to server-side code
  serverRuntimeConfig: {
    COGNITO_DOMAIN: process.env.COGNITO_DOMAIN,
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    COGNITO_CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET,
    COGNITO_REDIRECT_URI: process.env.COGNITO_REDIRECT_URI,
    COGNITO_LOGOUT_URI: process.env.COGNITO_LOGOUT_URI,
    COGNITO_USERPOOL_ID: process.env.COGNITO_USERPOOL_ID
  },
  publicRuntimeConfig: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  async rewrites() {
    return [
      // EXCLUDE auth routes from being rewritten to the backend
      // Only rewrite other API routes that should go to the backend
      {
        source: '/api/:path*',
        destination: 'https://backend.console-encryptgate.net/api/:path*',
        // Don't rewrite auth routes
        has: [
          {
            type: 'header',
            key: 'x-skip-rewrite',
            value: '1',
          },
        ],
      },
      // Add this to exclude auth routes from being rewritten
      {
        source: '/api/auth/:path*',
        destination: '/api/auth/:path*', // Keep these on the Next.js server
      },
    ];
  },
  
  async redirects() {
    return [
      {
        source: '/',
        destination: '/login',
        permanent: false,
      },
    ];
  },
};

mergeConfig(nextConfig, userConfig);

function mergeConfig(nextConfig, userConfig) {
  if (!userConfig) {
    return;
  }

  for (const key in userConfig) {
    if (
      typeof nextConfig[key] === 'object' &&
      !Array.isArray(nextConfig[key])
    ) {
      nextConfig[key] = {
        ...nextConfig[key],
        ...userConfig[key],
      };
    } else {
      nextConfig[key] = userConfig[key];
    }
  }
}

export default nextConfig;