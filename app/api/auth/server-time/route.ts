// app/api/auth/server-time/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    console.log(`🕐 Server time requested`);
    
    return NextResponse.json({
      success: true,
      server_time: new Date().toISOString(),
      unix_time: Math.floor(Date.now() / 1000),
    });
  } catch (error: any) {
    console.error("❌ Server time error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: "Failed to get server time",
        error: error.name || "ServerTimeError",
      },
      { status: 500 }
    );
  }
}