// lib/neo4j.ts - UPDATED WITH PARAMETER STORE SUPPORT
import neo4j, { Driver, Session } from 'neo4j-driver'
import { createHash } from 'crypto'
import { getNeo4jConfig, getOpenAIApiKey } from './config'

// === Constants ===
const MAX_RESULTS_TO_RETURN    = 50
const MAX_RESULTS_FOR_SUMMARY  = 20
const MAX_RETRY_ATTEMPTS       = 10
const LLM_TIMEOUT_MS           = 30_000
const OPENAI_MODEL            = process.env.OPENAI_MODEL || "gpt-4o-mini"
const OPENAI_URL              = 'https://api.openai.com/v1/chat/completions'

// === Neo4j Driver Setup with Parameter Store Support ===
let driver: Driver | null = null
let currentConfig: any = null

async function createNeo4jDriver(): Promise<Driver> {
  try {
    console.log('🔧 Loading Neo4j configuration from Parameter Store...')
    const config = await getNeo4jConfig()
    
    console.log('🔧 Creating Neo4j driver with config:', {
      uri: config.uri,
      user: config.user,
      encrypted: config.encrypted
    })
    
    currentConfig = config
    
    return neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.user, config.password),
      { 
        encrypted: config.encrypted,
        connectionTimeout: 10000, // 10 seconds
        maxConnectionLifetime: 3600000, // 1 hour
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 60000 // 1 minute
      }
    )
  } catch (error) {
    console.error('❌ Failed to create Neo4j driver:', error)
    throw error
  }
}

// Get or create driver (async now)
export async function getDriver(): Promise<Driver> {
  if (!driver) {
    driver = await createNeo4jDriver()
  }
  return driver
}

// Driver is available through getDriver() function for better control

// Test connection with detailed error reporting
export async function testNeo4jConnection(): Promise<boolean> {
  try {
    console.log('🔍 Testing Neo4j connection with Parameter Store config...')
    const testDriver = await getDriver()
    const session = testDriver.session()
    
    const result = await session.run('RETURN 1 as test, datetime() as time')
    const record = result.records[0]
    
    console.log('✅ Neo4j connection successful')
    console.log(`  Server time: ${record.get('time')}`)
    if (currentConfig) {
      console.log(`  Connected to: ${currentConfig.uri}`)
      console.log(`  User: ${currentConfig.user}`)
    }
    
    await session.close()
    return true
  } catch (error: any) {
    console.error('❌ Neo4j connection failed:', {
      config: currentConfig,
      error: error.message,
      code: error.code
    })
    
    // Provide specific error guidance
    if (error.message?.includes('ECONNREFUSED')) {
      console.error('💡 Connection refused - Neo4j is not accessible')
      console.error('   Please check:')
      console.error('   - Neo4j is running on your EC2 instance')
      console.error('   - Security group allows port 7687')
      console.error('   - Parameter Store has correct URI (encryptgate-neo4j-uri)')
    } else if (error.message?.includes('authentication')) {
      console.error('💡 Authentication failed - check Parameter Store credentials')
      console.error('   - encryptgate-neo4j-user')
      console.error('   - encryptgate-neo4j-password')
    } else if (error.message?.includes('timeout')) {
      console.error('💡 Connection timeout - check network connectivity')
    } else if (error.message?.includes('Parameter')) {
      console.error('💡 Parameter Store issue - check AWS configuration')
      console.error('   - IAM permissions for SSM GetParameter')
      console.error('   - Parameters exist in correct region')
    }
    
    return false
  }
}

// === Neo4j Connection Interface ===
interface Neo4jConnection {
  runQuery(cypher: string, params?: any): Promise<any[]>
  close(): Promise<void>
}

class Neo4jService implements Neo4jConnection {
  async runQuery(cypher: string, params: any = {}): Promise<any[]> {
    const driverInstance = await getDriver()
    const session: Session = driverInstance.session()
    try {
      const result = await session.run(cypher, params)
      return result.records.map(record => record.toObject())
    } catch (error) {
      throw error
    } finally {
      await session.close()
    }
  }

  async close(): Promise<void> {
    if (driver) {
      await driver.close()
      driver = null
      currentConfig = null
    }
  }
}

// Singleton instance
let neo4jService: Neo4jService | null = null

export async function ensureNeo4jConnection(): Promise<Neo4jConnection> {
  if (!neo4jService) {
    // Test connection first
    const isConnected = await testNeo4jConnection()
    if (!isConnected) {
      throw new Error('Cannot establish Neo4j connection. Please check your configuration.')
    }
    neo4jService = new Neo4jService()
  }
  return neo4jService
}

// === Prompt Templates ===
const SYSTEM_CYPHER_PROMPT = `
You are EncryptGate Copilot, a Neo4j Cypher expert.
Use only these labels and relationship types exactly as listed:
- Labels: User, Email, URL
- Relationships: WAS_SENT, WAS_SENT_TO, CONTAINS_URL
Do not invent or alter any names.
Generate ONLY the raw Cypher query without any markdown formatting, explanations, or code blocks.
The query should start with MATCH and include a RETURN clause.

IMPORTANT CONTEXT ABOUT THE SCHEMA:
- WAS_SENT: User -> Email (user sent the email)
- WAS_SENT_TO: Email -> User (email was sent to user)
- CONTAINS_URL: Email -> URL

For complex queries:
1. Use multiple simple MATCH patterns instead of very complex patterns
2. Build relationships with multiple simple steps and WITH clauses
3. Avoid variable-length paths (*) where possible
4. Keep queries focused and specific
5. Break queries into steps with WITH as needed
6. Never include markdown formatting
7. Do not end with backticks or code fences
8. Always limit large result sets with LIMIT or TOP
9. Use ORDER BY before LIMIT when sorting

IMPORTANT CONSTRAINTS:
- Cypher 4.x syntax only
- sentDate is a string, not a datetime
- Do not use UNWIND incorrectly; use COUNT() instead of size()
- NEVER change messageId format — keep angle brackets intact
`.trim()

const SYSTEM_CORRECTION_PROMPT = `
You are EncryptGate Copilot, a Neo4j Cypher expert.
Fix the broken Cypher query based on the error message provided.
Use only these labels and relationships:
- User, Email, URL
- WAS_SENT, WAS_SENT_TO, CONTAINS_URL

Context:
- sentDate is a string
- messageId must keep angle brackets

When correcting:
1. NEVER modify messageId format
2. Break complex patterns into simple steps with WITH
3. ALWAYS include LIMIT to prevent huge results

Return ONLY the fixed query. NO markdown, NO explanations.
`.trim()

const SYSTEM_SUMMARY_PROMPT = `
You are EncryptGate Copilot, a security analyst assistant.
Provide a clear, detailed summary of the query results:
- Explain what the data shows in context of the investigation.
- Highlight important findings.
- Suggest one concrete follow-up step.
Do NOT output any Cypher.
`.trim()

const SYSTEM_ERROR_ANALYSIS_PROMPT = `
You are EncryptGate Copilot, a security analyst assistant for Neo4j email investigations.

All query attempts failed. Analyze:
1. Why the queries couldn't connect or ran empty.
2. What schema or data limitations might apply.
3. How to rephrase the question for better results.
4. Suggest concrete alternative approaches.

Be empathetic, clear, and constructive.
`.trim()

// === In‐Memory Cache for Prompts ===
const promptCache = new Map<string,string>()
function md5(s: string): string {
  return createHash('md5').update(s).digest('hex')
}

// === Helper: LLM Call with Timeout ===
interface OpenAIResponse {
  choices: { message: { content: string } }[]
}

async function askLLM(
  system: string,
  user: string,
  forceNew = false,
  temperature = 0.2
): Promise<string> {
  let apiKey: string;
  try {
    apiKey = await getOpenAIApiKey();
    if (!apiKey) {
      return 'Error: OpenAI API key not available from Parameter Store or environment'
    }
  } catch (error: any) {
    return `Error: Failed to get OpenAI API key: ${error.message}`
  }

  const asciiUser = user.replace(/\u2026/g,'...').replace(/[^\x00-\x7F]/g,'')
  const cacheKey = md5(system + asciiUser)
  if (!forceNew && promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey)!
  }

  // truncate if too long
  let payload = asciiUser
  if (payload.length > 24000) {
    payload = payload.slice(0,24000) + '... [truncated]'
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

  try {
    const resp = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: payload }
        ],
        temperature
      }),
      signal: controller.signal
    })

    if (!resp.ok) {
      throw new Error(`LLM API ${resp.status} ${resp.statusText}`)
    }
    const json: OpenAIResponse = await resp.json()
    const content = json.choices?.[0]?.message?.content || ''
    if (!forceNew) promptCache.set(cacheKey, content)
    return content

  } catch (e: any) {
    return `Error communicating with LLM API: ${e.message.slice(0,100)}...`
  } finally {
    clearTimeout(timeoutId)
  }
}

// === Utility: Extract raw Cypher ===
function extractCypherQuery(text: string): string {
  // code fences first
  const fence = /```(?:cypher)?\s*([\s\S]*?)```/.exec(text)
  if (fence?.[1]) {
    return fence[1].trim()
  }
  // fallback MATCH…RETURN
  const qr = /(?:^|\n)(MATCH[\s\S]+?RETURN[\s\S]+?)(?:$|\n\n)/i.exec(text)
  if (qr?.[1]) {
    return qr[1].trim()
  }
  // strip backticks
  return text.replace(/```(?:\w+)?/g,'').trim()
}

// === Schema-based Query Template ===
const QUERY_TEMPLATES: Record<string,string> = {
  most_emails_to_recipient: `
MATCH (sender:User)-[:WAS_SENT]->(e:Email)-[:WAS_SENT_TO]->(recipient:User {email: "{recipient}"})
RETURN sender.email, COUNT(e) AS email_count
ORDER BY email_count DESC
LIMIT 5`.trim()
}

// === Simple Question Analyzer ===
function analyzeQuestion(
  question: string,
  scenario: string
): [string|null, any] {
  const q = question.toLowerCase()
  const m = /To:\s*(\S+)/.exec(scenario)
  const recipient = m?.[1] || null

  if (q.includes('most emails') && q.includes('to this email') &&
      (q.includes('who sent') || q.includes('who sends'))) {
    return ['most_emails_to_recipient', { recipient }]
  }
  return [null, {}]
}

// === Auto-Correct Broken Cypher ===
async function autoCorrectCypher(
  query: string,
  errorMsg: string,
  attempt: number,
  question: string,
  scenario: string,
  previousAttempts: [string,string][] | null = null
): Promise<string> {
  let prevTxt = ''
  if (previousAttempts) {
    prevTxt = previousAttempts
      .map(([q,e],i)=>`Attempt ${i+1}:\nQuery: ${q}\nError: ${e}`)
      .join('\n\n')
  }

  const prompt = `
Fix this Neo4j Cypher query that returned this error: "${errorMsg}"

Original question: "${question}"

Original query:
${query}

Email context:
${scenario}

${ prevTxt ? 'Previous attempts:\n'+ prevTxt + '\n' : '' }
The query must:
- KEEP messageId angle brackets.
- Break complex patterns into simple WITH steps.
- ALWAYS include LIMIT 50.

Return ONLY the fixed query.
`.trim()

  const corrected = await askLLM(
    SYSTEM_CORRECTION_PROMPT,
    prompt,
    true,
    Math.min(0.2 + attempt * 0.07, 0.9)
  )
  let q = extractCypherQuery(corrected)
  if (!/LIMIT/i.test(q)) {
    if (/ORDER BY/i.test(q)) {
      q = q.replace(/(ORDER BY[\s\S]*?)$/i, '$1 LIMIT 50')
    } else if (/RETURN/i.test(q)) {
      q += '\nLIMIT 50'
    }
  }
  return q
}

// === Final Failure Analysis ===
async function analyzeError(
  question: string,
  attempts: string[],
  errors: string[],
  scenario: string
): Promise<string> {
  const detail = attempts
    .map((q,i)=>`Attempt ${i+1} Query:\n${q}\nError: ${errors[i]}`)
    .join('\n\n')

  const prompt = `
User Question: "${question}"

Email Context:
${scenario}

All ${attempts.length} attempts failed:
${detail}

Analyze why they failed and recommend next steps.
`.trim()

  return askLLM(SYSTEM_ERROR_ANALYSIS_PROMPT, prompt, true, 0.5)
}

// === Build Prompt for New Cypher Generation ===
function buildCypherPrompt(question: string, scenario: string): string {
  return `
Context:
${scenario}

Question: "${question}"
Generate ONLY the raw Cypher query. No markdown or code fences.
MUST start with MATCH and include RETURN.
ALWAYS include LIMIT 50.
Keep messageId angle brackets intact.
`.trim()
}

// === Generate Initial Cypher ===
async function generateCypher(
  question: string,
  scenario: string
): Promise<string> {
  const [type,data] = analyzeQuestion(question, scenario)
  if (type === 'most_emails_to_recipient' && data.recipient) {
    return QUERY_TEMPLATES.most_emails_to_recipient.replace(
      '{recipient}',
      data.recipient
    )
  }

  const raw = await askLLM(SYSTEM_CYPHER_PROMPT, buildCypherPrompt(question, scenario))
  let q = extractCypherQuery(raw)

  if (!/LIMIT/i.test(q)) {
    if (/ORDER BY/i.test(q)) {
      q = q.replace(/(ORDER BY[\s\S]*?)$/i, '$1 LIMIT 50')
    } else if (/RETURN/i.test(q)) {
      q += '\nLIMIT 50'
    }
  }
  return q
}

// === Sanitize & Validate Cypher ===
function cleanQueryForExecution(query: string): string | null {
  if (!query) return null
  let q = query.replace(/```(?:\w+)?/g,'').trim()
  if (!/MATCH/i.test(q)) return null
  if (!/RETURN/i.test(q)) q += '\nRETURN *'
  if (!/LIMIT/i.test(q)) {
    if (/ORDER BY/i.test(q)) {
      q = q.replace(/(ORDER BY[\s\S]*?)$/i, '$1 LIMIT 50')
    } else {
      q += '\nLIMIT 50'
    }
  }
  return q
}

// === Execute Cypher ===
async function runQuery(cypher: string): Promise<any[]> {
  const driver = await getDriver()
  const session: Session = driver.session()
  try {
    const res = await session.run(cypher)
    await session.close()
    const rows = res.records.map(r => r.toObject())
    return rows.length > MAX_RESULTS_TO_RETURN
      ? rows.slice(0, MAX_RESULTS_TO_RETURN)
      : rows
  } catch (e: any) {
    await session.close()
    return [{ error: e.message }]
  }
}

// === Fetch Email Context ===
export async function fetchEmailContext(messageId: string): Promise<string> {
  try {
    const q = `
    MATCH (u:User)-[:WAS_SENT]->(e:Email {messageId:$m})
    OPTIONAL MATCH (e)-[:WAS_SENT_TO]->(r:User)
    RETURN u.email AS sender, collect(r.email) AS recipients,
           e.sentDate AS date, e.subject AS subject, e.body AS body
    `
    const driver = await getDriver()
    const session = driver.session()
    const result = await session.run(q, { m: messageId })
    await session.close()
    
    if (result.records.length === 0) return ''

    const rec = result.records[0].toObject() as any
    const snippet = (rec.body || '').replace(/\n/g,' ').slice(0,200)
    return [
      `Investigating Email:`,
      `- Message-ID: ${messageId}`,
      `- From: ${rec.sender}`,
      `- To: ${rec.recipients.join(', ')}`,
      `- Date: ${rec.date}`,
      `- Subject: ${rec.subject}`,
      `- Snippet: ${snippet}…`
    ].join('\n')
  } catch (error) {
    console.error('❌ Failed to fetch email context:', error)
    return ''
  }
}

// === Summarize Results ===
async function summarizeResults(
  question: string,
  cypher: string,
  results: any[]
): Promise<string> {
  if (!results || results.length === 0) {
    return 'No results found for this query.'
  }

  let prompt: string
  if (results.length > MAX_RESULTS_FOR_SUMMARY) {
    const sample = results.slice(0,5)
    const counts: Record<string,Record<string,number>> = {}
    for (const row of results) {
      for (const k in row) {
        const v = String(row[k]) || 'null'
        counts[k] = counts[k] || {}
        counts[k][v] = (counts[k][v]||0) + 1
      }
    }
    prompt = `
User asked: "${question}"
Cypher:
${cypher}

Returned ${results.length} rows. Statistical summary:
${JSON.stringify(counts, null, 2)}

Sample:
${JSON.stringify(sample, null, 2)}

Provide a clear analysis in context.
`.trim()
  } else {
    prompt = `
User asked: "${question}"
Cypher:
${cypher}

Results:
${JSON.stringify(results, null, 2)}

Provide a clear analysis in context.
`.trim()
  }

  try {
    return (await askLLM(SYSTEM_SUMMARY_PROMPT, prompt)).trim()
  } catch {
    return `Query returned ${results.length} rows; unable to generate detailed summary. Sample: ${JSON.stringify(results.slice(0,3))}`
  }
}

// === Main Entry Point ===
export async function askCopilot(
  question: string,
  messageId: string
): Promise<string> {
  try {
    // Test connection first
    const isConnected = await testNeo4jConnection()
    if (!isConnected) {
      return '❌ Neo4j database connection failed. Please check your connection settings and ensure Neo4j is running.'
    }

    const scenario = await fetchEmailContext(messageId)
    if (!scenario) {
      return `❌ No email found with Message-ID "${messageId}". Please verify the email exists in the database.`
    }

    const attempts: string[] = []
    const errors:   string[] = []

    // 1) Special‐case "most emails to recipient"
    const [type,data] = analyzeQuestion(question, scenario)
    if (type === 'most_emails_to_recipient' && data.recipient) {
      const qtpl = QUERY_TEMPLATES.most_emails_to_recipient.replace(
        '{recipient}', data.recipient
      )
      attempts.push(qtpl)
      const res = await runQuery(qtpl)
      if (res.length && !('error' in res[0])) {
        return summarizeResults(question, qtpl, res)
      } else {
        errors.push(res[0].error || 'No results')
      }
    }

    // 2) General flow with retries
    for (let i = 1; i <= MAX_RETRY_ATTEMPTS; i++) {
      let q: string
      if (i === 1) {
        q = await generateCypher(question, scenario)
      } else {
        q = await autoCorrectCypher(
          attempts[i-2],
          errors[i-2],
          i,
          question,
          scenario,
          i > 5 ? attempts.slice(-3).map((q,j)=>[q, errors[errors.length-3+j]] as [string,string]) : null
        )
      }
      attempts.push(q)

      const clean = cleanQueryForExecution(q)
      if (!clean) {
        errors.push('Invalid or empty query')
        continue
      }

      const res = await runQuery(clean)
      if (res.length && !('error' in res[0])) {
        return summarizeResults(question, clean, res)
      } else {
        errors.push(res[0].error || 'No results')
      }
    }

    // 3) All attempts failed
    const explanation = await analyzeError(question, attempts, errors, scenario)

    return [
      `❌ Unable to generate a valid query after ${MAX_RETRY_ATTEMPTS} attempts.`,
      '',
      explanation,
      '',
      '**Troubleshooting Tips:**',
      '- Ensure Neo4j has email data loaded',
      '- Try simpler questions first',
      '- Check if the email message ID exists in the database'
    ].join('\n')

  } catch (error: any) {
    console.error('❌ Copilot error:', error)
    return `❌ System Error: ${error.message}. Please check Neo4j connection and try again.`
  }
}