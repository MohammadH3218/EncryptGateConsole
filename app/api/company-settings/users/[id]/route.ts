// app/api/company-settings/users/[id]/route.ts

import { NextResponse } from "next/server"
import {
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb"
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider"

// Load your custom-named env vars
const REGION            = process.env.REGION!
const ORG_ID            = process.env.ORGANIZATION_ID!
const ACCESS_KEY_ID     = process.env.ACCESS_KEY_ID!
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY!
const CS_TABLE          = process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices"

// Sanity checks
if (!REGION)            throw new Error("Missing REGION env var")
if (!ORG_ID)            throw new Error("Missing ORGANIZATION_ID env var")
if (!ACCESS_KEY_ID)     throw new Error("Missing ACCESS_KEY_ID env var")
if (!SECRET_ACCESS_KEY) throw new Error("Missing SECRET_ACCESS_KEY env var")

// DynamoDB client with explicit credentials
const ddb = new DynamoDBClient({
  region: REGION,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
})

async function getCognitoConfig() {
  const resp = await ddb.send(
    new GetItemCommand({
      TableName: CS_TABLE,
      Key: {
        orgId:       { S: ORG_ID },
        serviceType: { S: "aws-cognito" },
      },
    })
  )
  if (!resp.Item) {
    throw new Error("No AWS Cognito configuration found")
  }
  return {
    userPoolId: resp.Item.userPoolId.S!,
    region:     resp.Item.region.S!,
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params // this is the email/username
  const { userPoolId, region } = await getCognitoConfig()

  // Cognito client with explicit credentials
  const cognito = new CognitoIdentityProviderClient({
    region,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  })

  await cognito.send(
    new AdminDeleteUserCommand({
      UserPoolId: userPoolId,
      Username:   id,
    })
  )

  return NextResponse.json({ message: "Deleted" })
}
