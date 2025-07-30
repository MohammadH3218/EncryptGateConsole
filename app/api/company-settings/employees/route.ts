// app/api/company-settings/employees/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import {
  WorkMailClient,
  ListUsersCommand,
} from '@aws-sdk/client-workmail';

// ───────────────────────────────────────────────────────────────────────────────
// Environment and clients
// ───────────────────────────────────────────────────────────────────────────────
const DDB_REGION = process.env.AWS_REGION || process.env.REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID!;
const EMPLOYEES_TABLE =
  process.env.EMPLOYEES_TABLE_NAME || 'Employees';

// for sync:
const WORKMAIL_ORG = process.env.WORKMAIL_ORGANIZATION_ID;

if (!ORG_ID)
  throw new Error('Missing ORGANIZATION_ID env var');

const ddb = new DynamoDBClient({ region: DDB_REGION });
const wmc = new WorkMailClient({ region: DDB_REGION });

// ───────────────────────────────────────────────────────────────────────────────
// GET /api/company-settings/employees
//   List your monitored employees (from DynamoDB).
// ───────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const resp = await ddb.send(
      new QueryCommand({
        TableName: EMPLOYEES_TABLE,
        KeyConditionExpression: 'orgId = :orgId',
        ExpressionAttributeValues: {
          ':orgId': { S: ORG_ID },
        },
      })
    );

    const employees = (resp.Items || []).map((item) => ({
      id: item.email!.S!,
      name: item.name!.S || '',
      email: item.email!.S || '',
      department: item.department!.S || '',
      jobTitle: item.jobTitle!.S || '',
      status: item.status!.S || 'active',
      addedAt: item.addedAt!.S || null,
      lastEmailProcessed: item.lastEmailProcessed!.S || null,
      syncedFromWorkMail: item.syncedFromWorkMail?.S || null,
      workMailUserId: item.workMailUserId?.S || null,
    }));

    return NextResponse.json(employees);
  } catch (err: any) {
    console.error('[employees:GET] Error:', err);
    return NextResponse.json(
      {
        error: 'Failed to list monitored employees',
        message: err.message,
        code: err.code || err.name,
      },
      { status: 500 }
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// POST /api/company-settings/employees
//   Manually add one employee to monitoring.
// ───────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const { name, email, department, jobTitle } = await req.json();
    if (!name || !email) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          required: ['name', 'email'],
        },
        { status: 400 }
      );
    }

    await ddb.send(
      new PutItemCommand({
        TableName: EMPLOYEES_TABLE,
        Item: {
          orgId: { S: ORG_ID },
          email: { S: email },
          name: { S: name },
          department: { S: department || '' },
          jobTitle: { S: jobTitle || '' },
          status: { S: 'active' },
          addedAt: { S: new Date().toISOString() },
          lastEmailProcessed: { S: new Date().toISOString() },
        },
      })
    );

    return NextResponse.json({
      id: email,
      name,
      email,
      department: department || '',
      jobTitle: jobTitle || '',
      status: 'active',
      addedAt: new Date().toISOString(),
      lastEmailProcessed: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[employees:POST] Error:', err);
    let status = 500;
    let msg = 'Failed to add employee to monitoring';

    if (err.name === 'ConditionalCheckFailedException') {
      status = 409;
      msg = 'Employee already being monitored';
    } else if (err.name === 'InvalidParameterException') {
      status = 400;
      msg = 'Invalid parameters provided';
    }

    return NextResponse.json(
      { error: msg, message: err.message, code: err.code || err.name },
      { status }
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// PUT /api/company-settings/employees
//   Sync all AWS WorkMail users into your Employees table.
// ───────────────────────────────────────────────────────────────────────────────
export async function PUT(req: Request) {
  if (!WORKMAIL_ORG) {
    return NextResponse.json(
      {
        error:
          'WorkMail not configured. Set WORKMAIL_ORGANIZATION_ID environment variable.',
      },
      { status: 400 }
    );
  }

  try {
    const resp = await wmc.send(
      new ListUsersCommand({
        OrganizationId: WORKMAIL_ORG,
        MaxResults: 1000,
      })
    );

    const users = resp.Users || [];
    for (const u of users) {
      await ddb.send(
        new PutItemCommand({
          TableName: EMPLOYEES_TABLE,
          Item: {
            orgId: { S: ORG_ID },
            workMailUserId: { S: u.Id! },
            email: { S: u.Email! },
            name: { S: u.Name! },
            status: { S: u.State! },
            // optional extra fields:
            syncedFromWorkMail: { S: new Date().toISOString() },
            // if you have displayName or dept, you can map here:
            department: { S: u.DisplayName || '' },
            jobTitle: { S: '' },
            addedAt: { S: new Date().toISOString() },
          },
        })
      );
    }

    return NextResponse.json({
      message: `Imported ${users.length} WorkMail users into monitoring.`,
    });
  } catch (err: any) {
    console.error('[employees:PUT] WorkMail sync error:', err);
    return NextResponse.json(
      { error: 'Failed to sync WorkMail users', message: err.message },
      { status: 500 }
    );
  }
}
