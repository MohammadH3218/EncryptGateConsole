// app/api/email/route.ts - UPDATED to work with userId+receivedAt schema
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  ScanCommand,
  QueryCommand,
  ScanCommandInput,
} from '@aws-sdk/client-dynamodb';
import { ddb, extractOrgId, handleAwsError, TABLES } from '@/lib/aws';

const EMPLOYEES_TABLE = process.env.EMPLOYEES_TABLE_NAME || 'Employees';

// GET /api/email?limit=20&page=1&search=<query>
export async function GET(request: Request) {
  try {
    // Extract organization ID from request
    const orgId = extractOrgId(request);
    if (!orgId) {
      return NextResponse.json({ 
        ok: false, 
        error: 'MISSING_ORG_ID',
        message: 'Organization ID is required' 
      }, { status: 400 });
    }
    
    console.log(`📧 GET /api/email - Loading emails for org: ${orgId}`);
    const url = new URL(request.url);
    const rawLim = url.searchParams.get('limit') || '20';
    const rawPage = url.searchParams.get('page') || '1';
    const searchQuery = url.searchParams.get('search') || '';

    // Parse parameters
    const limit = Math.min(100, Math.max(1, parseInt(rawLim, 10) || 20));
    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    console.log(`🔍 Query parameters: limit=${limit}, page=${page}, searchQuery="${searchQuery}"`);

    // Handle search mode vs pagination mode
    let allEmails: any[] = [];
    let hasMorePages = false;
    
    if (searchQuery.trim()) {
      // Search mode: scan entire table, filter, sort, then paginate
      console.log('🔍 Search mode: scanning entire table for search query');
      let searchResults: any[] = [];
      let scanLastKey: any = undefined;
      let scanCount = 0;
      
      do {
        const searchScanParams: ScanCommandInput = { 
          TableName: TABLES.EMAILS,
          Limit: 1000 // Higher limit for search to be more efficient
        };

        if (scanLastKey) {
          searchScanParams.ExclusiveStartKey = scanLastKey;
        }
        
        console.log(`🔍 Search scan iteration ${++scanCount}`);
        const searchResp = await ddb.send(new ScanCommand(searchScanParams));
        
        if (searchResp.Items) {
          // Filter items server-side based on search query
          const filteredItems = searchResp.Items.filter(item => {
            const q = searchQuery.toLowerCase();
            const subject = (item.subject?.S || '').toLowerCase();
            const sender = (item.sender?.S || '').toLowerCase();
            const body = (item.body?.S || '').toLowerCase();
            
            // Handle recipients (can be SS, S, or L format)
            let recipientsText = '';
            if (item.recipients?.SS) {
              recipientsText = item.recipients.SS.join(' ').toLowerCase();
            } else if (item.recipients?.S) {
              recipientsText = item.recipients.S.toLowerCase();
            } else if (item.recipients?.L) {
              recipientsText = item.recipients.L.map((r: any) => r.S || '').join(' ').toLowerCase();
            }
            
            return subject.includes(q) || 
                   sender.includes(q) || 
                   recipientsText.includes(q) || 
                   body.includes(q);
          });
          
          searchResults.push(...filteredItems);
        }
        
        scanLastKey = searchResp.LastEvaluatedKey;
        
        // Safety check for search
        if (scanCount > 100) {
          console.warn('⚠️ Search scan limit reached, stopping');
          break;
        }
        
      } while (scanLastKey);
      
      console.log(`✅ Search complete: ${searchResults.length} matching emails found`);
      
      // Sort search results by timestamp (newest first)
      searchResults.sort((a, b) => {
        const timeA = a.receivedAt?.S || a.timestamp?.S || '0';
        const timeB = b.receivedAt?.S || b.timestamp?.S || '0';
        return timeB.localeCompare(timeA);
      });
      
      // Apply page-based pagination to search results
      const startIdx = (page - 1) * limit;
      const endIdx = startIdx + limit;
      allEmails = searchResults.slice(startIdx, endIdx);
      hasMorePages = endIdx < searchResults.length;
      
    } else {
      // Pagination mode: scan and collect enough data for page-based pagination
      console.log('📋 Pagination mode: scanning emails table...');
      let allScanResults: any[] = [];
      let scanLastKey: any = undefined;
      let scanCount = 0;
      
      // Scan enough to get to the requested page
      const neededItems = page * limit;
      
      do {
        const scanParams: ScanCommandInput = { 
          TableName: TABLES.EMAILS,
          Limit: Math.min(1000, neededItems - allScanResults.length + limit) // Get a bit extra to check for more pages
        };

        if (scanLastKey) {
          scanParams.ExclusiveStartKey = scanLastKey;
        }
        
        console.log(`📋 Scan iteration ${++scanCount}, current total: ${allScanResults.length}, target: ${neededItems}`);
        const resp = await ddb.send(new ScanCommand(scanParams));
        
        if (resp.Items) {
          allScanResults.push(...resp.Items);
        }
        
        scanLastKey = resp.LastEvaluatedKey;
        
        // Safety check
        if (scanCount > 50) {
          console.warn('⚠️ Scan limit reached, stopping');
          break;
        }
        
      } while (scanLastKey && allScanResults.length < neededItems + limit);
      
      // Sort all results by timestamp (newest first)
      allScanResults.sort((a, b) => {
        const timeA = a.receivedAt?.S || a.timestamp?.S || '0';
        const timeB = b.receivedAt?.S || b.timestamp?.S || '0';
        return timeB.localeCompare(timeA);
      });
      
      // Apply page-based pagination
      const startIdx = (page - 1) * limit;
      const endIdx = startIdx + limit;
      allEmails = allScanResults.slice(startIdx, endIdx);
      hasMorePages = endIdx < allScanResults.length || !!scanLastKey;
    }
    
    console.log(`✅ ${searchQuery ? 'Search' : 'Pagination'} complete: ${allEmails.length} emails retrieved for page ${page}, hasMore: ${hasMorePages}`);

    // Get list of monitored employees for debugging/stats (but don't filter by them)
    let monitoredEmployees: string[] = [];
    try {
      const empResp = await ddb.send(new QueryCommand({
        TableName: EMPLOYEES_TABLE,
        KeyConditionExpression: 'orgId = :orgId',
        ExpressionAttributeValues: {
          ':orgId': { S: orgId }
        }
      }));
      monitoredEmployees = (empResp.Items || []).map(item => item.email?.S).filter(Boolean) as string[];
      console.log(`👥 Found ${monitoredEmployees.length} monitored employees (for stats only):`, monitoredEmployees);
    } catch (empError) {
      console.warn('⚠️ Could not fetch monitored employees (continuing anyway):', empError);
    }

    console.log(`✅ Retrieved ${allEmails.length} total emails`);

    if (allEmails.length === 0) {
      console.log('ℹ️ No emails found');
      
      return NextResponse.json({
        emails: [],
        lastKey: null,
        hasMore: false,
        message: 'No emails found in the Emails table. This could mean the table is empty or there may be a connection issue.',
        debug: {
          orgId,
          tableName: TABLES.EMAILS,
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

    // All emails are already limited by DynamoDB scan
    const limitedEmails = allEmails;

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
        recipients: (() => {
          // Handle different formats: SS (string set), S (comma-separated string), or array
          if (item.recipients?.SS) {
            return item.recipients.SS;
          } else if (item.recipients?.S) {
            // Handle comma-separated string
            return item.recipients.S.split(',').map((r: string) => r.trim()).filter(Boolean);
          } else if (item.recipients?.L) {
            // Handle list format
            return item.recipients.L.map((r: any) => r.S || '').filter(Boolean);
          }
          return [];
        })(),
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
      currentPage: page,
      hasMore: hasMorePages,
      debug: {
        orgId,
        tableName: TABLES.EMAILS,
        totalItems: emails.length,
        currentPage: page,
        hasMore: hasMorePages,
        monitoredEmployees: monitoredEmployees.length,
        queryMethod: searchQuery ? 'search_paginated' : 'scan_paginated',
        searchQuery: searchQuery || undefined
      }
    };

    console.log('📤 Returning response:', {
      emailCount: emails.length,
      hasMore: response.hasMore,
      queryMethod: response.debug.queryMethod
    });

    return NextResponse.json(response);

  } catch (err: any) {
    const awsError = handleAwsError(err, 'GET /api/email');
    
    return NextResponse.json(
      {
        error: awsError.error || 'Failed to fetch emails',
        message: awsError.message,
        troubleshooting: [
          'Check AWS credentials are valid and not expired',
          'Verify IAM permissions for DynamoDB access',
          'Ensure organization ID is passed correctly',
          'Check if WorkMail webhook is configured and working',
          'Verify monitored employees are configured'
        ],
        debug: {
          orgId,
          tableName: TABLES.EMAILS
        }
      },
      { status: awsError.statusCode }
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