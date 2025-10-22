import { NextRequest, NextResponse } from "next/server"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb"
import { fromNodeProviderChain } from "@aws-sdk/credential-providers"

const REGION = process.env.AWS_REGION || process.env.REGION || "us-east-1"
const ORGANIZATIONS_TABLE = process.env.ORGANIZATIONS_TABLE_NAME || "Organizations"

let cachedClient: DynamoDBDocumentClient | null = null

function getClient() {
  if (cachedClient) return cachedClient
  const baseClient = new DynamoDBClient({
    region: REGION,
    credentials: fromNodeProviderChain(),
  })
  cachedClient = DynamoDBDocumentClient.from(baseClient, {
    marshallOptions: { removeUndefinedValues: true },
  })
  return cachedClient
}

export async function GET(
  _req: NextRequest,
  context: { params: { orgId: string } },
) {
  const orgId = context.params.orgId

  if (!orgId) {
    return NextResponse.json({ error: "Missing orgId" }, { status: 400 })
  }

  try {
    const ddb = getClient()
    const command = new GetCommand({
      TableName: ORGANIZATIONS_TABLE,
      Key: { organizationId: orgId },
      ProjectionExpression: "#id, #name, orgCode, region, status",
      ExpressionAttributeNames: {
        "#id": "organizationId",
        "#name": "name",
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
