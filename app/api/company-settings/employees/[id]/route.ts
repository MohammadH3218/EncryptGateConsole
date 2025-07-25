import { NextResponse } from "next/server"
import {
  DynamoDBClient,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb"

const REGION = process.env.REGION!
const ORG_ID = process.env.ORGANIZATION_ID!
const TABLE = process.env.EMPLOYEES_TABLE_NAME || "Employees"

const ddb = new DynamoDBClient({ region: REGION })

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  // id = `${orgId}_${email}`
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
