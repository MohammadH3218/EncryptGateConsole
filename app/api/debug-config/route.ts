// app/api/debug-config/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    env: {
      NEO4J_URI: process.env.NEO4J_URI || 'NOT SET',
      NEO4J_USER: process.env.NEO4J_USER || 'NOT SET',
      NEO4J_ENCRYPTED: process.env.NEO4J_ENCRYPTED || 'NOT SET',
      NODE_ENV: process.env.NODE_ENV,
      AWS_REGION: process.env.AWS_REGION || 'NOT SET',
    },
    note: 'This shows what environment variables are loaded'
  });
}
