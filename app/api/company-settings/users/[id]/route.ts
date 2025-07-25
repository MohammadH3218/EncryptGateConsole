import { NextResponse } from "next/server"
import {
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb"
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider"

const REGION = process.env.REGION!
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

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params // this is the email/username
  const { userPoolId, region } = await getCognitoConfig()
  const cognito = new CognitoIdentityProviderClient({ region })

  await cognito.send(
    new AdminDeleteUserCommand({
      UserPoolId: userPoolId,
      Username: id,
    })
  )

  return NextResponse.json({ message: "Deleted" })
}
