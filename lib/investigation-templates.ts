// lib/investigation-templates.ts - Save and load custom investigation workflows
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { v4 as uuidv4 } from 'uuid'

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
const docClient = DynamoDBDocumentClient.from(client)

const TABLE_NAME = process.env.INVESTIGATION_TEMPLATES_TABLE || 'InvestigationTemplates'

/**
 * Investigation template
 */
export interface InvestigationTemplate {
  templateId: string                  // PK
  name: string                        // Template name
  description: string                 // What this template does
  prompt: string                      // LLM prompt
  createdBy: string                   // User ID who created it
  createdAt: string                   // ISO timestamp
  updatedAt: string                   // ISO timestamp
  isPublic: boolean                   // Shared with team
  orgId?: string                      // Organization ID
  tags: string[]                      // Searchable tags
  expectedSteps: string[]             // Expected investigation steps
  usageCount: number                  // How many times used
  category?: 'phishing' | 'malware' | 'spam' | 'data-leak' | 'generic'
}

/**
 * Create a new template
 */
export async function createTemplate(
  name: string,
  description: string,
  prompt: string,
  createdBy: string,
  options?: {
    isPublic?: boolean
    orgId?: string
    tags?: string[]
    expectedSteps?: string[]
    category?: string
  }
): Promise<InvestigationTemplate> {
  const template: InvestigationTemplate = {
    templateId: uuidv4(),
    name,
    description,
    prompt,
    createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isPublic: options?.isPublic || false,
    orgId: options?.orgId,
    tags: options?.tags || [],
    expectedSteps: options?.expectedSteps || [],
    usageCount: 0,
    category: options?.category as any
  }

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: template
  }))

  console.log(`✅ Created template: ${template.templateId} - ${name}`)
  return template
}

/**
 * Get a template by ID
 */
export async function getTemplate(templateId: string): Promise<InvestigationTemplate | null> {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { templateId }
    }))

    return result.Item as InvestigationTemplate || null
  } catch (error) {
    console.error(`Failed to get template ${templateId}:`, error)
    return null
  }
}

/**
 * Get all public templates
 */
export async function getPublicTemplates(): Promise<InvestigationTemplate[]> {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'isPublic = :true',
      ExpressionAttributeValues: {
        ':true': true
      }
    }))

    return (result.Items || []) as InvestigationTemplate[]
  } catch (error) {
    console.error('Failed to get public templates:', error)
    return []
  }
}

/**
 * Get templates by organization
 */
export async function getOrgTemplates(orgId: string): Promise<InvestigationTemplate[]> {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'OrgIdIndex',
      KeyConditionExpression: 'orgId = :orgId',
      ExpressionAttributeValues: {
        ':orgId': orgId
      }
    }))

    return (result.Items || []) as InvestigationTemplate[]
  } catch (error) {
    console.error(`Failed to get org templates for ${orgId}:`, error)
    return []
  }
}

/**
 * Get templates by user
 */
export async function getUserTemplates(userId: string): Promise<InvestigationTemplate[]> {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'CreatedByIndex',
      KeyConditionExpression: 'createdBy = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }))

    return (result.Items || []) as InvestigationTemplate[]
  } catch (error) {
    console.error(`Failed to get user templates for ${userId}:`, error)
    return []
  }
}

/**
 * Update a template
 */
export async function updateTemplate(
  templateId: string,
  updates: Partial<InvestigationTemplate>
): Promise<void> {
  const updateExpressions: string[] = []
  const expressionAttributeNames: Record<string, string> = {}
  const expressionAttributeValues: Record<string, any> = {}

  let index = 0
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'templateId' || key === 'createdBy' || key === 'createdAt') continue

    const attrName = `#attr${index}`
    const attrValue = `:val${index}`

    updateExpressions.push(`${attrName} = ${attrValue}`)
    expressionAttributeNames[attrName] = key
    expressionAttributeValues[attrValue] = value

    index++
  }

  updateExpressions.push('#updatedAt = :updatedAt')
  expressionAttributeNames['#updatedAt'] = 'updatedAt'
  expressionAttributeValues[':updatedAt'] = new Date().toISOString()

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Key: { templateId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  } as any))

  console.log(`✅ Updated template: ${templateId}`)
}

/**
 * Delete a template
 */
export async function deleteTemplate(templateId: string): Promise<void> {
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { templateId }
  }))

  console.log(`🗑️ Deleted template: ${templateId}`)
}

/**
 * Increment usage count
 */
export async function incrementUsageCount(templateId: string): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Key: { templateId },
    UpdateExpression: 'SET usageCount = usageCount + :inc',
    ExpressionAttributeValues: {
      ':inc': 1
    }
  } as any))
}

/**
 * Search templates by tags or category
 */
export async function searchTemplates(
  query: string,
  category?: string
): Promise<InvestigationTemplate[]> {
  try {
    let filterExpression = 'contains(#name, :query) OR contains(description, :query)'
    const expressionAttributeNames: Record<string, string> = {
      '#name': 'name'
    }
    const expressionAttributeValues: Record<string, any> = {
      ':query': query
    }

    if (category) {
      filterExpression += ' AND category = :category'
      expressionAttributeValues[':category'] = category
    }

    const result = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: filterExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    }))

    return (result.Items || []) as InvestigationTemplate[]
  } catch (error) {
    console.error('Failed to search templates:', error)
    return []
  }
}

/**
 * Get default/built-in templates
 */
export function getBuiltInTemplates(): InvestigationTemplate[] {
  return [
    {
      templateId: 'builtin-phishing-check',
      name: 'Phishing Indicator Check',
      description: 'Check for common phishing indicators like spoofed domains, urgency language, and suspicious links',
      prompt: `Analyze this email for phishing indicators:

1. Check sender domain authenticity
2. Analyze URLs for typosquatting or suspicious domains
3. Look for urgency language or social engineering tactics
4. Check for impersonation attempts
5. Review email headers for spoofing

Provide a risk score and specific indicators found.`,
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPublic: true,
      tags: ['phishing', 'security', 'urls'],
      expectedSteps: ['Domain check', 'URL analysis', 'Content analysis', 'Header review'],
      usageCount: 0,
      category: 'phishing'
    },
    {
      templateId: 'builtin-malware-attachment',
      name: 'Malware Attachment Analysis',
      description: 'Analyze attachments for malware indicators',
      prompt: `Investigate this email for malware indicators:

1. List all attachments and their file types
2. Check for suspicious file extensions (.exe, .scr, .zip, etc.)
3. Look for double extensions or obfuscated names
4. Check sender reputation for malware campaigns
5. Review any embedded macros or scripts

Assess the malware risk level.`,
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPublic: true,
      tags: ['malware', 'attachments', 'security'],
      expectedSteps: ['Attachment enumeration', 'File type analysis', 'Sender check', 'Risk assessment'],
      usageCount: 0,
      category: 'malware'
    },
    {
      templateId: 'builtin-data-exfiltration',
      name: 'Data Exfiltration Check',
      description: 'Check if email is attempting to exfiltrate sensitive data',
      prompt: `Check for data exfiltration indicators:

1. Analyze recipient list for external domains
2. Check for large attachments or unusual file transfers
3. Look for sensitive keywords (passwords, confidential, API keys)
4. Review sender's recent activity for anomalies
5. Check if this is part of a bulk email pattern

Determine if data exfiltration is likely.`,
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPublic: true,
      tags: ['data-leak', 'confidential', 'security'],
      expectedSteps: ['Recipient analysis', 'Attachment check', 'Content scan', 'Pattern detection'],
      usageCount: 0,
      category: 'data-leak'
    },
    {
      templateId: 'builtin-business-email-compromise',
      name: 'Business Email Compromise (BEC) Detection',
      description: 'Detect BEC attacks impersonating executives or vendors',
      prompt: `Analyze for Business Email Compromise (BEC) indicators:

1. Check if sender is impersonating an executive or vendor
2. Look for financial requests (wire transfers, invoice changes)
3. Analyze urgency and secrecy language
4. Verify sender domain against known contacts
5. Check for display name spoofing

Assess BEC likelihood and provide evidence.`,
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPublic: true,
      tags: ['bec', 'impersonation', 'financial', 'security'],
      expectedSteps: ['Impersonation check', 'Financial request analysis', 'Domain verification', 'Language analysis'],
      usageCount: 0,
      category: 'phishing'
    }
  ]
}
