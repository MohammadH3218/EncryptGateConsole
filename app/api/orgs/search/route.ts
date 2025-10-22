import { NextRequest, NextResponse } from "next/server"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb"
import { fromNodeProviderChain } from "@aws-sdk/credential-providers"

const REGION = process.env.AWS_REGION || process.env.REGION || "us-east-1"
const ORGANIZATIONS_TABLE = process.env.ORGANIZATIONS_TABLE_NAME || "Organizations"
const MAX_RESULTS = 10
const MAX_SCAN_PAGES = 3

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

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "").trim()
  if (!query) {
    return NextResponse.json({ items: [] })
  }

  try {
    const ddb = getClient()
    const lowercaseQuery = query.toLowerCase()
    const items: Array<Record<string, any>> = []
    let lastEvaluatedKey: Record<string, any> | undefined
    let page = 0

    do {
      const scanCommand = new ScanCommand({
        TableName: ORGANIZATIONS_TABLE,
        ProjectionExpression: "#id, #name, orgCode, region",
        ExpressionAttributeNames: {
          "#id": "organizationId",
          "#name": "name",
        },
        ExclusiveStartKey: lastEvaluatedKey,
        Limit: 200,
      })

      const result = await ddb.send(scanCommand)
      if (result.Items) {
        items.push(...result.Items)
      }

      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, any> | undefined
      page += 1
    } while (lastEvaluatedKey && page < MAX_SCAN_PAGES && items.length < 200)

    const matches = items
      .map((item) => ({
        organizationId: item.organizationId as string,
        name: item.name as string | undefined,
        orgCode: item.orgCode as string | undefined,
        region: item.region as string | undefined,
      }))
      .filter((item) => {
        const nameMatch = item.name?.toLowerCase().includes(lowercaseQuery)
        const idMatch = item.organizationId?.toLowerCase().includes(lowercaseQuery)
        const codeMatch = item.orgCode?.toLowerCase().includes(lowercaseQuery)
        return Boolean(nameMatch || idMatch || codeMatch)
      })
      .slice(0, MAX_RESULTS)

    return NextResponse.json({ items: matches })
  } catch (error) {
    console.error("Org search failed:", error)
    return NextResponse.json(
      { items: [], error: "Failed to search organizations" },
      { status: 500 },
    )
  }
}
