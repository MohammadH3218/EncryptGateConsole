import { NextResponse } from "next/server"
import {
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb"
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider"

const REGION = process.env.AWS_REGION!
const ORG_ID = process.env.ORGANIZATION_ID!
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices"

const ddb = new DynamoDBClient({ region: REGION })

async function getCognitoConfig() {
  const resp = await ddb.send(
    new GetItemCommand({
      TableName: CS_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        serviceType: { S: "aws-cognito" },
      },
    })
  )
  if (!resp.Item)
    throw new Error("No AWS Cognito configuration found")
  return {
    userPoolId: resp.Item.userPoolId.S!,
    region: resp.Item.region.S!,
  }
}

export async function GET() {
  const { userPoolId, region } = await getCognitoConfig()
  const cognito = new CognitoIdentityProviderClient({ region })

  const resp = await cognito.send(
    new ListUsersCommand({ UserPoolId: userPoolId })
  )

  const users = (resp.Users || []).map((u) => ({
    id: u.Username!,
    name:
      u.Attributes?.find((a) => a.Name === "name")?.Value ||
      "",
    email:
      u.Attributes?.find((a) => a.Name === "email")?.Value ||
      "",
    role:
      u.Attributes?.find((a) => a.Name === "custom:role")
        ?.Value || "",
    status: (u.UserStatus || "").toLowerCase(),
    lastLogin: u.UserLastModifiedDate
      ? u.UserLastModifiedDate.toISOString()
      : null,
  }))

  return NextResponse.json(users)
}

export async function POST(req: Request) {
  const { name, email, role } = await req.json()
  const { userPoolId, region } = await getCognitoConfig()
  const cognito = new CognitoIdentityProviderClient({ region })

  // 1. Create user (no auto-email)
  await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        { Name: "name", Value: name },
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
        { Name: "custom:role", Value: role },
      ],
      MessageAction: "SUPPRESS",
    })
  )

  // 2. Add to group for role-based access
  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: email,
      GroupName: role,
    })
  )

  return NextResponse.json({
    id: email,
    name,
    email,
    role,
    status: "pending",
    lastLogin: null,
  })
}
