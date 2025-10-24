// scripts/setup-investigation-history-table.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTimeToLiveCommand
} from '@aws-sdk/client-dynamodb'

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
const TABLE_NAME = 'InvestigationHistory'

async function setupInvestigationHistoryTable() {
  console.log('🚀 Setting up Investigation History table...\n')

  try {
    // Check if table already exists
    try {
      const describeResult = await client.send(new DescribeTableCommand({
        TableName: TABLE_NAME
      }))

      console.log(`✅ Table "${TABLE_NAME}" already exists`)
      console.log(`   Status: ${describeResult.Table?.TableStatus}`)
      console.log(`   Items: ${describeResult.Table?.ItemCount || 0}`)
      return
    } catch (error: any) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error
      }
      // Table doesn't exist, create it
    }

    // Create table
    console.log(`📝 Creating table "${TABLE_NAME}"...`)

    await client.send(new CreateTableCommand({
      TableName: TABLE_NAME,
      KeySchema: [
        { AttributeName: 'sessionId', KeyType: 'HASH' }  // Partition key
      ],
      AttributeDefinitions: [
        { AttributeName: 'sessionId', AttributeType: 'S' },
        { AttributeName: 'emailId', AttributeType: 'S' },
        { AttributeName: 'createdAt', AttributeType: 'S' }
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'EmailIdIndex',
          KeySchema: [
            { AttributeName: 'emailId', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' }
          ],
          Projection: {
            ProjectionType: 'ALL'
          },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
          }
        }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      },
      Tags: [
        { Key: 'Application', Value: 'EncryptGate' },
        { Key: 'Component', Value: 'InvestigationHistory' }
      ]
    }))

    console.log('✅ Table created successfully!')

    // Wait for table to become active
    console.log('⏳ Waiting for table to become active...')
    let isActive = false
    while (!isActive) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      const result = await client.send(new DescribeTableCommand({
        TableName: TABLE_NAME
      }))
      isActive = result.Table?.TableStatus === 'ACTIVE'
      console.log(`   Status: ${result.Table?.TableStatus}`)
    }

    console.log('\n📊 Table Details:')
    console.log(`   Name: ${TABLE_NAME}`)
    console.log(`   Primary Key: sessionId (String)`)
    console.log(`   GSI: EmailIdIndex (emailId + createdAt)`)
    console.log(`   Read Capacity: 5`)
    console.log(`   Write Capacity: 5`)

    console.log('\n✅ Investigation History table setup complete!')

  } catch (error: any) {
    console.error('❌ Error setting up table:', error.message)
    throw error
  }
}

// Run setup
setupInvestigationHistoryTable().catch(console.error)
