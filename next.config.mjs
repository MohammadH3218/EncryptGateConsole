// next.config.mjs
let userConfig
try {
  userConfig = await import('./v0-user-next.config')
} catch { /* ignore */ }

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
  },

  // ← add this
  env: {
    // your Dynamo + Cognito + API vars
    REGION: process.env.REGION,
    ORGANIZATION_ID: process.env.ORGANIZATION_ID,
    ACCESS_KEY_ID: process.env.ACCESS_KEY_ID,
    SECRET_ACCESS_KEY: process.env.SECRET_ACCESS_KEY,
    CLOUDSERVICES_TABLE_NAME:
      process.env.CLOUDSERVICES_TABLE_NAME ||
      process.env.CLOUDSERVICES_TABLE,  // you can keep your existing name
    COGNITO_USERPOOL_ID: process.env.COGNITO_USERPOOL_ID,
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    COGNITO_CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET,
    COGNITO_REDIRECT_URI: process.env.COGNITO_REDIRECT_URI,
    COGNITO_LOGOUT_URI: process.env.COGNITO_LOGOUT_URI,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },

  rewrites() { /* … */ },
  redirects() { /* … */ },
}

mergeConfig(nextConfig, userConfig)
export default nextConfig
