// app/api/company-settings/users/pool/route.ts

export const runtime = 'nodejs'

import { NextResponse } from "next/server"
import {
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb"
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider"

// Same env vars you use in cloud-services:
const ORG_ID = process.env.ORGANIZATION_ID!
const TABLE  =
  process.env.CLOUDSERVICES_TABLE_NAME ||
  process.env.CLOUDSERVICES_TABLE         ||
  "CloudServices"
const REGION = process.env.AWS_REGION!

// Dynamo client with Amplify-injected credentials
const ddb = new DynamoDBClient({ region: REGION })

export async function GET() {
  try {
    // 1) fetch the aws-cognito entry from Dynamo
    const resp = await ddb.send(new GetItemCommand({
      TableName: TABLE,
      Key: {
        orgId:       { S: ORG_ID },
        serviceType: { S: "aws-cognito" },
      },
    }))

    if (!resp.Item) {
      return NextResponse.json(
        { error: "No AWS Cognito configuration found" },
        { status: 404 }
      )
    }

    const userPoolId    = resp.Item.userPoolId!.S!
    const cognitoRegion = resp.Item.region!.S!

    // 2) call Cognito to list all users
    const cognito = new CognitoIdentityProviderClient({ region: cognitoRegion })
    const { Users = [] } = await cognito.send(
      new ListUsersCommand({ UserPoolId: userPoolId })
    )

    // 3) map to { username, name, email }
    const payload = Users.map((u) => {
      const attrs = u.Attributes || []
      const name  = attrs.find((a) => a.Name === "name")?.Value || ""
      const email = attrs.find((a) => a.Name === "email")?.Value || ""
      return {
        username: u.Username || "",
        name,
        email,
      }
    })

    return NextResponse.json(payload)
  } catch (err) {
    console.error("❌ GET /users/pool error:", err)
    return NextResponse.json(
      { error: "Failed to list users", message: String(err) },
      { status: 500 }
    )
  }
}
