// app/api/database/inspect/route.ts

import { NextResponse } from 'next/server'
import { inspectDatabase, checkEmailData } from '@/lib/neo4j-inspector'

export async function GET() {
  try {
    const [dbStats, emailData] = await Promise.all([
      inspectDatabase(),
      checkEmailData()
    ])
    
    return NextResponse.json({
      success: true,
      database: dbStats,
      emailData: emailData,
      analysis: {
        hasExistingData: dbStats.totalNodes > 0,
        hasEmailData: emailData.hasEmails,
        dataTypes: dbStats.nodeLabels.map(nl => nl.label),
        recommendation: getRecommendation(dbStats, emailData)
      }
    })
    
  } catch (error) {
    console.error('Database inspection failed:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Database inspection failed'
    }, { status: 500 })
  }
}

function getRecommendation(dbStats: any, emailData: any): string {
  if (dbStats.totalNodes === 0) {
    return "Database is empty - safe to proceed with WorkMail integration"
  }
  
  if (emailData.hasEmails) {
    return "Database contains email data - WorkMail emails will be added to existing data"
  }
  
  const hasEmailCompatibleStructure = dbStats.nodeLabels.some((nl: any) => 
    ['User', 'Email', 'Person', 'Message'].includes(nl.label)
  )
  
  if (hasEmailCompatibleStructure) {
    return "Database has compatible structure - consider reviewing existing data before adding WorkMail emails"
  }
  
  return "Database contains other data - consider using a separate database or namespace for WorkMail emails"
}