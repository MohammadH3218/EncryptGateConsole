// app/api/auth/set-session/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { orgId, tokens, user } = await req.json();
    
    if (!orgId || !tokens?.accessToken || !user?.email) {
      return NextResponse.json(
        { success: false, message: "Missing required session data" },
        { status: 400 }
      );
    }

    console.log(`🍪 Setting session for ${user.email} in org ${orgId}`);

    // Create response and set secure cookies
    const response = NextResponse.json({ success: true });
    
    // Set access token (httpOnly for security)
    response.cookies.set('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: tokens.expiresIn || 3600, // Default 1 hour
    });

    // Set ID token (httpOnly for security)
    if (tokens.idToken) {
      response.cookies.set('id_token', tokens.idToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: tokens.expiresIn || 3600,
      });
    }

    // Set refresh token (httpOnly for security)
    if (tokens.refreshToken) {
      response.cookies.set('refresh_token', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }

    // Set organization ID for middleware
    response.cookies.set('org_id', orgId, {
      httpOnly: false, // Accessible to client for routing
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    // Set user info (for display purposes, non-sensitive)
    response.cookies.set('user_email', user.email, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: tokens.expiresIn || 3600,
    });

    if (user.name) {
      response.cookies.set('user_name', user.name, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: tokens.expiresIn || 3600,
      });
    }

    console.log(`✅ Session cookies set for ${user.email}`);
    return response;

  } catch (error: any) {
    console.error("❌ Session setup error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Internal server error during session setup",
        error: error.name || "SessionError",
      },
      { status: 500 }
    );
  }
}