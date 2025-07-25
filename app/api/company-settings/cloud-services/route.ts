import { NextResponse } from "next/server"
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb"

const REGION = process.env.REGION!
const ORG_ID = process.env.ORGANIZATION_ID!
const TABLE = process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices"

const ddb = new DynamoDBClient({ region: REGION })

export async function GET() {
  // return all cloud‐service configs for this org
  const resp = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "orgId = :orgId",
      ExpressionAttributeValues: {
        ":orgId": { S: ORG_ID },
      },
    })
  )
  const services = (resp.Items || []).map((it) => ({
    id: `${it.orgId.S}_${it.serviceType.S}`,
    name:
      it.serviceType.S === "aws-cognito"
        ? "AWS Cognito"
        : it.serviceType.S,
    status: (it.status.S as "connected" | "disconnected") || "disconnected",
    lastSynced: it.lastSynced.S!,
    userCount: it.userCount?.N ? parseInt(it.userCount.N) : 0,
  }))
  return NextResponse.json(services)
}

export async function POST(req: Request) {
  // save a new cloud‐service config
  const { serviceType, userPoolId, clientId, region } =
    await req.json()
  const now = new Date().toISOString()

  const item = {
    orgId: { S: ORG_ID },
    serviceType: { S: serviceType },
    userPoolId: { S: userPoolId },
    clientId: { S: clientId },
    region: { S: region },
    status: { S: "connected" },
    lastSynced: { S: now },
    userCount: { N: "0" },
  }

  await ddb.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: item,
    })
  )

  return NextResponse.json({
    id: `${ORG_ID}_${serviceType}`,
    name:
      serviceType === "aws-cognito"
        ? "AWS Cognito"
        : serviceType,
    status: "connected",
    lastSynced: now,
    userCount: 0,
  })
}
