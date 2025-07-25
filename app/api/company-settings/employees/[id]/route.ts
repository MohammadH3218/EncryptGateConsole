// app/api/company-settings/employees/[id]/route.ts

import { NextResponse } from "next/server"
import {
  DynamoDBClient,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb"

// Load your custom-named env vars
const REGION            = process.env.REGION!
const ORG_ID            = process.env.ORGANIZATION_ID!
const ACCESS_KEY_ID     = process.env.ACCESS_KEY_ID!
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY!
const TABLE             = process.env.EMPLOYEES_TABLE_NAME || "Employees"

// Sanity checks
if (!REGION)            throw new Error("Missing REGION env var")
if (!ORG_ID)            throw new Error("Missing ORGANIZATION_ID env var")
if (!ACCESS_KEY_ID)     throw new Error("Missing ACCESS_KEY_ID env var")
if (!SECRET_ACCESS_KEY) throw new Error("Missing SECRET_ACCESS_KEY env var")

// Explicitly pass credentials to DynamoDBClient
const ddb = new DynamoDBClient({
  region: REGION,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
})

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  // params.id is `${orgId}_${email}`
  const [, email] = params.id.split("_")

  await ddb.send(
    new DeleteItemCommand({
      TableName: TABLE,
      Key: {
        orgId: { S: ORG_ID },
        email: { S: email },
      },
    })
  )

  return NextResponse.json({ message: "Removed" })
}
