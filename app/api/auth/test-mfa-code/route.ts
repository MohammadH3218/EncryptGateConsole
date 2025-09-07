// app/api/auth/test-mfa-code/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { authenticator } from "otplib";

export async function POST(req: Request) {
  try {
    const { secret, client_time, adjusted_time } = await req.json();
    
    if (!secret) {
      return NextResponse.json(
        { success: false, message: "Secret is required" },
        { status: 400 }
      );
    }

    console.log(`🔄 Testing MFA code generation for secret`);

    try {
      // Use adjusted time if provided, otherwise current time
      const timeToUse = adjusted_time ? new Date(adjusted_time) : new Date();
      const currentUnixTime = Math.floor(timeToUse.getTime() / 1000);
      
      // Generate current TOTP code
      const currentCode = authenticator.generate(secret);
      
      // Generate codes for a few time windows (for testing purposes)
      const timeWindows = [];
      for (let i = -2; i <= 2; i++) {
        const windowTime = currentUnixTime + (i * 30); // 30-second windows
        const windowDate = new Date(windowTime * 1000);
        
        try {
          authenticator.options = { window: 0 }; // Exact time window
          const code = authenticator.generate(secret);
          timeWindows.push({
            time: windowDate.toISOString(),
            code: code,
            offset: i
          });
        } catch (err) {
          console.warn(`Failed to generate code for window ${i}:`, err);
        }
      }

      console.log(`✅ Generated test MFA codes`);

      return NextResponse.json({
        success: true,
        current_code: currentCode,
        server_time: new Date().toISOString(),
        client_time: client_time,
        adjusted_time: adjusted_time,
        time_windows: timeWindows,
        validCodes: [currentCode], // For backward compatibility
        serverGeneratedCode: currentCode, // For backward compatibility
        currentValidCode: currentCode, // For backward compatibility
        timeInfo: {
          server: new Date().toISOString(),
          client: client_time,
          adjusted: adjusted_time,
          unix: currentUnixTime
        }
      });

    } catch (otpError: any) {
      console.error(`❌ OTP generation error:`, otpError);
      
      return NextResponse.json(
        { 
          success: false, 
          message: "Failed to generate test codes", 
          error: otpError.message 
        },
        { status: 400 }
      );
    }

  } catch (error: any) {
    console.error("❌ Test MFA code error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Internal server error during MFA code testing",
        error: error.name || "TestMFACodeError",
      },
      { status: 500 }
    );
  }
}