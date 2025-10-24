// lib/copilot-formatting.ts - Format and enhance copilot responses

/**
 * Email reference in text
 */
export interface EmailReference {
  emailId: string
  displayText: string
  startIndex: number
  endIndex: number
}

/**
 * Parse email references from copilot response
 * Looks for patterns like:
 * - Email: <messageId>
 * - Message ID: <messageId>
 * - [emailId]
 * - `<messageId>`
 */
export function parseEmailReferences(text: string): EmailReference[] {
  const references: EmailReference[] = []

  // Pattern 1: Email: <messageId> or Message ID: <messageId>
  const pattern1 = /(Email|Message ID|Email ID|MessageID):\s*<?([^>\s]+@[^>\s]+)>?/gi
  let match: RegExpExecArray | null

  while ((match = pattern1.exec(text)) !== null) {
    const emailId = match[2]
    if (emailId && emailId.includes('@')) {
      references.push({
        emailId,
        displayText: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length
      })
    }
  }

  // Pattern 2: Markdown-style email reference [email](emailId)
  const pattern2 = /\[email:([^\]]+)\]\(([^)]+)\)/gi
  while ((match = pattern2.exec(text)) !== null) {
    references.push({
      emailId: match[2],
      displayText: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }

  // Pattern 3: Message IDs in angle brackets <messageId>
  const pattern3 = /<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/g
  while ((match = pattern3.exec(text)) !== null) {
    // Skip if already captured by another pattern
    const emailId = match[1]
    const alreadyExists = references.some(ref =>
      ref.startIndex <= match!.index && ref.endIndex >= match!.index + match![0].length
    )

    if (!alreadyExists && emailId) {
      references.push({
        emailId,
        displayText: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length
      })
    }
  }

  // Sort by start index to process in order
  return references.sort((a, b) => a.startIndex - b.startIndex)
}

/**
 * Format markdown-style text to HTML
 */
export function formatMarkdown(text: string): string {
  let formatted = text

  // Headers
  formatted = formatted.replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
  formatted = formatted.replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>')
  formatted = formatted.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>')

  // Bold
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
  formatted = formatted.replace(/__(.+?)__/g, '<strong class="font-semibold">$1</strong>')

  // Italic
  formatted = formatted.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
  formatted = formatted.replace(/_(.+?)_/g, '<em class="italic">$1</em>')

  // Code blocks
  formatted = formatted.replace(/```(\w+)?\n([\s\S]+?)```/g, (_, lang, code) => {
    return `<pre class="bg-neutral-900 p-3 rounded-lg my-2 overflow-x-auto"><code class="text-sm text-neutral-300">${escapeHtml(code.trim())}</code></pre>`
  })

  // Inline code
  formatted = formatted.replace(/`(.+?)`/g, '<code class="bg-neutral-800 px-1.5 py-0.5 rounded text-sm text-blue-400">$1</code>')

  // Bullet lists
  formatted = formatted.replace(/^- (.+)$/gm, '<li class="ml-4">• $1</li>')
  formatted = formatted.replace(/(<li.*<\/li>\n?)+/g, '<ul class="my-2 space-y-1">$&</ul>')

  // Numbered lists
  formatted = formatted.replace(/^\d+\. (.+)$/gm, '<li class="ml-4">$1</li>')

  // Line breaks
  formatted = formatted.replace(/\n\n/g, '<br/><br/>')
  formatted = formatted.replace(/\n/g, '<br/>')

  return formatted
}

/**
 * Escape HTML
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m])
}

/**
 * Enhanced formatting for security-specific content
 */
export function formatSecurityContent(text: string): string {
  let formatted = text

  // Highlight risk levels
  formatted = formatted.replace(/\b(Critical|High|Medium|Low)\s+(Risk|Priority|Severity)\b/gi, (match) => {
    const level = match.split(' ')[0].toLowerCase()
    const colors: Record<string, string> = {
      critical: 'text-red-400 font-semibold',
      high: 'text-orange-400 font-semibold',
      medium: 'text-yellow-400 font-semibold',
      low: 'text-green-400 font-semibold'
    }
    return `<span class="${colors[level]}">${match}</span>`
  })

  // Highlight email addresses
  formatted = formatted.replace(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    '<span class="font-mono text-blue-400">$1</span>'
  )

  // Highlight URLs
  formatted = formatted.replace(/https?:\/\/[^\s<]+/g,
    '<span class="font-mono text-purple-400">$&</span>'
  )

  // Highlight IPs
  formatted = formatted.replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g,
    '<span class="font-mono text-cyan-400">$1</span>'
  )

  // Highlight suspicious indicators
  const suspiciousWords = ['malware', 'phishing', 'suspicious', 'malicious', 'threat', 'attack', 'compromised', 'breach']
  suspiciousWords.forEach(word => {
    const regex = new RegExp(`\\b(${word})\\b`, 'gi')
    formatted = formatted.replace(regex, '<span class="text-red-400 font-medium">$1</span>')
  })

  return formatted
}

/**
 * Get email references data for rendering
 * Returns references that can be used to create clickable elements in React
 */
export function getEmailReferencesData(text: string): {
  hasReferences: boolean
  references: EmailReference[]
  textParts: Array<{ type: 'text' | 'reference'; content: string; reference?: EmailReference; index: number }>
} {
  const references = parseEmailReferences(text)

  if (references.length === 0) {
    return {
      hasReferences: false,
      references: [],
      textParts: [{ type: 'text', content: text, index: 0 }]
    }
  }

  const textParts: Array<{ type: 'text' | 'reference'; content: string; reference?: EmailReference; index: number }> = []
  let lastIndex = 0

  references.forEach((ref, index) => {
    // Add text before reference
    if (ref.startIndex > lastIndex) {
      textParts.push({
        type: 'text',
        content: text.substring(lastIndex, ref.startIndex),
        index: textParts.length
      })
    }

    // Add reference marker
    textParts.push({
      type: 'reference',
      content: ref.displayText,
      reference: ref,
      index: textParts.length
    })

    lastIndex = ref.endIndex
  })

  // Add remaining text
  if (lastIndex < text.length) {
    textParts.push({
      type: 'text',
      content: text.substring(lastIndex),
      index: textParts.length
    })
  }

  return {
    hasReferences: true,
    references,
    textParts
  }
}
