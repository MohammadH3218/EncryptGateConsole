// app/api/auth/team-members/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

// Mock team members endpoint
export async function GET() {
  try {
    // Return mock team member data
    // In a real implementation, this would fetch from a user database
    const teamMembers = [
      {
        id: '1',
        name: 'John Doe',
        email: 'john.doe@company.com',
        role: 'Security Analyst',
        status: 'active',
        lastActive: new Date().toISOString()
      },
      {
        id: '2', 
        name: 'Jane Smith',
        email: 'jane.smith@company.com',
        role: 'Senior Analyst',
        status: 'active',
        lastActive: new Date(Date.now() - 300000).toISOString() // 5 minutes ago
      }
    ];

    return NextResponse.json({
      success: true,
      teamMembers,
      count: teamMembers.length
    });

  } catch (error: any) {
    console.error('❌ Team members error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team members', details: error.message },
      { status: 500 }
    );
  }
}