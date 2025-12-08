import { NextRequest, NextResponse } from "next/server"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb"
import { fromNodeProviderChain } from "@aws-sdk/credential-providers"

const REGION = process.env.AWS_REGION || process.env.REGION || "us-east-1"
const ORGANIZATIONS_TABLE = process.env.ORGANIZATIONS_TABLE_NAME || "Organizations"

let cachedClient: DynamoDBDocumentClient | null = null

function getClient() {
  if (cachedClient) return cachedClient
  
  // Use explicit credentials if available (for local dev), otherwise use provider chain
  let credentials
  if (process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY) {
    console.log('[OrgGet] Using explicit AWS credentials from environment')
    credentials = {
      accessKeyId: process.env.ACCESS_KEY_ID,
      secretAccessKey: process.env.SECRET_ACCESS_KEY,
    }
  } else {
    console.log('[OrgGet] Using AWS credential provider chain')
    credentials = fromNodeProviderChain()
  }
  
  const baseClient = new DynamoDBClient({
    region: REGION,
    credentials,
  })
  cachedClient = DynamoDBDocumentClient.from(baseClient, {
    marshallOptions: { removeUndefinedValues: true },
  })
  return cachedClient
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await context.params

  if (!orgId) {
    return NextResponse.json({ error: "Missing orgId" }, { status: 400 })
  }

  try {
    const ddb = getClient()
    const command = new GetCommand({
      TableName: ORGANIZATIONS_TABLE,
      Key: { organizationId: orgId },
      ProjectionExpression: "#id, #name, orgCode, #region, #status",
      ExpressionAttributeNames: {
        "#id": "organizationId",
        "#name": "name",
        "#region": "region",
        "#status": "status",
      },
    })

    const result = await ddb.send(command)
    const item = result.Item as Record<string, any> | undefined

    if (!item) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    return NextResponse.json({
      organizationId: item.organizationId ?? orgId,
      name: item.name,
      orgCode: item.orgCode,
      region: item.region,
      status: item.status,
    })
  } catch (error) {
    console.error(`Failed to load organization ${orgId}:`, error)
    return NextResponse.json(
      { error: "Failed to load organization" },
      { status: 500 },
    )
  }
}
