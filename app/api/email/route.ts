// app/api/email/route.ts - UPDATED to work with userId+receivedAt schema
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  ScanCommand,
  QueryCommand,
  ScanCommandInput,
} from '@aws-sdk/client-dynamodb';

const REGION       = process.env.AWS_REGION           || 'us-east-1';
const ORG_ID       = process.env.ORGANIZATION_ID      || 'default-org';
const EMAILS_TABLE = process.env.EMAILS_TABLE_NAME    || 'Emails';
const EMPLOYEES_TABLE = process.env.EMPLOYEES_TABLE_NAME || 'Employees';

console.log('📧 Email API initialized:', { REGION, ORG_ID, EMAILS_TABLE, EMPLOYEES_TABLE });

const ddb = new DynamoDBClient({ region: REGION });

// GET /api/email?limit=50&lastKey=<encoded>
export async function GET(request: Request) {
  try {
    console.log('📧 GET /api/email - Loading emails from database');
    const url = new URL(request.url);
    const rawLim = url.searchParams.get('limit') || '50';
    const rawKey = url.searchParams.get('lastKey') || undefined;

    // Parse & clamp limit
    const limit = Math.min(1000, Math.max(1, parseInt(rawLim, 10) || 50));
    console.log(`🔍 Query parameters: limit=${limit}, hasLastKey=${!!rawKey}`);

    // Get list of monitored employees
    let monitoredEmployees: string[] = [];
    try {
      if (ORG_ID !== 'default-org') {
        const empResp = await ddb.send(new QueryCommand({
          TableName: EMPLOYEES_TABLE,
          KeyConditionExpression: 'orgId = :orgId',
          ExpressionAttributeValues: {
            ':orgId': { S: ORG_ID }
          }
        }));
        monitoredEmployees = (empResp.Items || []).map(item => item.email?.S).filter(Boolean) as string[];
        console.log(`👥 Found ${monitoredEmployees.length} monitored employees:`, monitoredEmployees);
      }
    } catch (empError) {
      console.warn('⚠️ Could not fetch monitored employees:', empError);
    }

    let allEmails: any[] = [];
    let lastEvaluatedKey: any = undefined;

    // If we have monitored employees, query by userId for each one
    if (monitoredEmployees.length > 0) {
      console.log('📋 Querying emails for each monitored employee...');
      
      for (const employeeEmail of monitoredEmployees) {
        try {
          const queryParams: any = {
            TableName: EMAILS_TABLE,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
              ':userId': { S: employeeEmail }
            },
            ScanIndexForward: false, // Get newest first
            Limit: Math.ceil(limit / monitoredEmployees.length) // Distribute limit across employees
          };

          console.log(`🔍 Querying emails for employee: ${employeeEmail}`);
          const result = await ddb.send(new QueryCommand(queryParams));
          
          if (result.Items && result.Items.length > 0) {
            allEmails.push(...result.Items);
            console.log(`📧 Found ${result.Items.length} emails for ${employeeEmail}`);
          }
        } catch (queryError: any) {
          console.warn(`⚠️ Error querying emails for ${employeeEmail}:`, queryError.message);
        }
      }
    } else {
      // Fallback: scan the entire table if no monitored employees
      console.log('📋 No monitored employees found, scanning entire table...');
      
      const scanParams: ScanCommandInput = { 
        TableName: EMAILS_TABLE, 
        Limit: limit 
      };

      if (rawKey) {
        try {
          scanParams.ExclusiveStartKey = JSON.parse(decodeURIComponent(rawKey));
          console.log('⏭️ Resuming pagination with lastKey');
        } catch (e) {
          console.warn('⚠️ Invalid lastKey, ignoring:', rawKey);
        }
      }

      const resp = await ddb.send(new ScanCommand(scanParams));
      allEmails = resp.Items || [];
      lastEvaluatedKey = resp.LastEvaluatedKey;
    }

    console.log(`✅ Retrieved ${allEmails.length} total emails`);

    if (allEmails.length === 0) {
      console.log('ℹ️ No emails found');
      
      return NextResponse.json({
        emails: [],
        lastKey: null,
        hasMore: false,
        message: monitoredEmployees.length === 0 
          ? 'No monitored employees configured. Please add employees to monitoring first.'
          : 'No emails found for monitored employees. Make sure WorkMail webhook is configured and employees are receiving emails.',
        debug: {
          orgId: ORG_ID,
          tableName: EMAILS_TABLE,
          monitoredEmployees: monitoredEmployees.length,
          employeeList: monitoredEmployees
        }
      });
    }

    // Sort all emails by timestamp (newest first)
    allEmails.sort((a, b) => {
      const timeA = a.receivedAt?.S || a.timestamp?.S || '0';
      const timeB = b.receivedAt?.S || b.timestamp?.S || '0';
      return timeB.localeCompare(timeA);
    });

    // Limit results
    const limitedEmails = allEmails.slice(0, limit);

    // Map DynamoDB items into plain JSON
    const emails = limitedEmails.map((item, index) => {
      console.log(`📄 Processing email ${index + 1}:`, {
        messageId: item.messageId?.S || 'unknown',
        sender: item.sender?.S || 'unknown',
        subject: item.subject?.S || 'No Subject',
        timestamp: item.receivedAt?.S || item.timestamp?.S || 'unknown',
        userId: item.userId?.S || 'none',
        // DEBUG: Check body fields in DynamoDB item
        hasBodyField: !!item.body,
        bodyType: item.body ? Object.keys(item.body)[0] : 'none',
        bodyContent: item.body?.S ? item.body.S.substring(0, 100) + '...' : 'NO BODY',
        hasBodyHtmlField: !!item.bodyHtml,
        bodyHtmlType: item.bodyHtml ? Object.keys(item.bodyHtml)[0] : 'none',
        bodyHtmlContent: item.bodyHtml?.S ? item.bodyHtml.S.substring(0, 100) + '...' : 'NO HTML BODY',
        allFields: Object.keys(item)
      });

      const timestamp = item.receivedAt?.S || item.timestamp?.S || new Date().toISOString();

      return {
        id: item.messageId?.S || item.emailId?.S || `unknown-${index}`,
        messageId: item.messageId?.S || '',
        subject: item.subject?.S || 'No Subject',
        sender: item.sender?.S || '',
        recipients: item.recipients?.SS || [],
        timestamp: timestamp,
        body: item.body?.S || '',
        bodyHtml: item.bodyHtml?.S,
        status: item.status?.S || 'received',
        threatLevel: item.threatLevel?.S || 'none',
        isPhishing: item.isPhishing?.BOOL || false,
        attachments: item.attachments?.SS || [],
        headers: item.headers?.S ? (() => {
          try {
            return JSON.parse(item.headers.S);
          } catch {
            return {};
          }
        })() : {},
        direction: item.direction?.S || 'inbound',
        size: parseInt(item.size?.N || '0', 10),
        urls: item.urls?.SS || [],
        userId: item.userId?.S || '', // Include for debugging
        flaggedCategory: item.flaggedCategory?.S || item.flaggedStatus?.S || 'none', // none, manual, ai, clean
        flaggedSeverity: item.flaggedSeverity?.S,
        investigationStatus: item.investigationStatus?.S,
        detectionId: item.detectionId?.S,
        flaggedAt: item.flaggedAt?.S,
        flaggedBy: item.flaggedBy?.S,
        investigationNotes: item.investigationNotes?.S,
        updatedAt: item.updatedAt?.S
      };
    });

    console.log(`✅ Successfully processed ${emails.length} emails`);
    
    // Log sample email for debugging
    if (emails.length > 0) {
      console.log('📋 Sample email data (first email):', {
        id: emails[0].id,
        subject: emails[0].subject,
        sender: emails[0].sender,
        recipients: emails[0].recipients,
        timestamp: emails[0].timestamp,
        userId: emails[0].userId,
        bodyExists: !!emails[0].body,
        bodyLength: emails[0].body?.length || 0,
        bodyContent: emails[0].body ? emails[0].body.substring(0, 100) + '...' : 'NO BODY',
        bodyHtmlExists: !!emails[0].bodyHtml,
        bodyHtmlLength: emails[0].bodyHtml?.length || 0,
        bodyHtmlContent: emails[0].bodyHtml ? emails[0].bodyHtml.substring(0, 100) + '...' : 'NO HTML BODY'
      });
      
      // Count emails with body content
      const emailsWithBody = emails.filter(e => e.body && e.body.trim().length > 0).length;
      const emailsWithHtml = emails.filter(e => e.bodyHtml && e.bodyHtml.trim().length > 0).length;
      console.log('📊 API Body content summary:', {
        totalEmails: emails.length,
        emailsWithBody,
        emailsWithHtml,
        emailsWithoutBody: emails.length - emailsWithBody
      });
    }

    const response = {
      emails,
      lastKey: lastEvaluatedKey 
        ? encodeURIComponent(JSON.stringify(lastEvaluatedKey))
        : null,
      hasMore: Boolean(lastEvaluatedKey),
      debug: {
        orgId: ORG_ID,
        tableName: EMAILS_TABLE,
        totalItems: emails.length,
        hasMore: Boolean(lastEvaluatedKey),
        monitoredEmployees: monitoredEmployees.length,
        queryMethod: monitoredEmployees.length > 0 ? 'query_by_userId' : 'scan_table'
      }
    };

    console.log('📤 Returning response:', {
      emailCount: emails.length,
      hasMore: response.hasMore,
      hasLastKey: !!response.lastKey,
      queryMethod: response.debug.queryMethod
    });

    return NextResponse.json(response);

  } catch (err: any) {
    console.error('❌ [GET /api/email] error details:', {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack?.split('\n').slice(0, 3)
    });

    return NextResponse.json(
      {
        error: 'Failed to fetch emails',
        details: err.message,
        code: err.code || err.name,
        troubleshooting: [
          'Check AWS credentials and permissions',
          'Verify table name exists in DynamoDB',
          'Ensure organization ID is correct (if set)',
          'Check if WorkMail webhook is configured and working',
          'Verify monitored employees are configured'
        ],
        debug: {
          orgId: ORG_ID,
          tableName: EMAILS_TABLE,
          region: REGION
        }
      },
      { status: 500 }
    );
  }
}

// POST /api/email → forward to your existing processor
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
    console.log('📨 POST /api/email - Forwarding to email processor:', payload);
  } catch (err: any) {
    console.error('❌ [POST /api/email] invalid JSON:', err);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const BASE_URL = process.env.BASE_URL || 'https://console-encryptgate.net';
    console.log(`🔄 Forwarding to email processor: ${BASE_URL}/api/email-processor`);
    const resp = await fetch(`${BASE_URL}/api/email-processor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    const data = await resp.json();
    console.log('✅ Email processor response:', { status: resp.status, data });
    
    return NextResponse.json(data, { status: resp.status });
  } catch (err: any) {
    console.error('❌ [POST /api/email] forward error:', err);
    return NextResponse.json(
      { error: 'Failed to forward to email-processor', details: err.message },
      { status: 500 }
    );
  }
}