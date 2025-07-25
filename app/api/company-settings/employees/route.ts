import { NextResponse } from "next/server"
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb"

const REGION = process.env.REGION!
const ORG_ID = process.env.ORGANIZATION_ID!
const TABLE = process.env.EMPLOYEES_TABLE_NAME || "Employees"

const ddb = new DynamoDBClient({ region: REGION })

export async function GET() {
  const resp = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "orgId = :orgId",
      ExpressionAttributeValues: {
        ":orgId": { S: ORG_ID },
      },
    })
  )

  const employees = (resp.Items || []).map((it) => ({
    id: `${it.orgId.S}_${it.email.S}`,
    email: it.email.S!,
  }))

  return NextResponse.json(employees)
}

export async function POST(req: Request) {
  const { email } = await req.json()
  await ddb.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: {
        orgId: { S: ORG_ID },
        email: { S: email },
      },
    })
  )
  return NextResponse.json({
    id: `${ORG_ID}_${email}`,
    email,
  })
}
