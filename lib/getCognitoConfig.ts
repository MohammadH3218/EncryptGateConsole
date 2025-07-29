// lib/getCognitoConfig.ts

import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb"

// Your two explicit env-vars
const ORG_ID = process.env.ORGANIZATION_ID!
const TABLE  =
  process.env.CLOUDSERVICES_TABLE_NAME ||
  process.env.CLOUDSERVICES_TABLE ||
  "CloudServices"

const REGION = process.env.AWS_REGION!

const ddb = new DynamoDBClient({ region: REGION })

export async function getCognitoConfig(): Promise<{
  userPoolId: string
  clientId:   string
  region:     string
}> {
  const resp = await ddb.send(
    new GetItemCommand({
      TableName: TABLE,
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
    userPoolId: resp.Item.userPoolId!.S!,
    clientId:   resp.Item.clientId!.S!,
    region:     resp.Item.region!.S!,
  }
}
