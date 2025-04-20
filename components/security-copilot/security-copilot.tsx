"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Bot, Send, X, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

interface SecurityCopilotProps {
  detectionData?: any
  emailData?: any
  className?: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export function SecurityCopilot({ detectionData, emailData, className, isOpen, onOpenChange }: SecurityCopilotProps) {
  const [isMinimized, setIsMinimized] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm your Security Copilot. I can help you investigate this detection by answering questions and providing insights. What would you like to know?",
      timestamp: new Date(),
    },
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const hasInitializedRef = useRef(false)

  // Generate suggested questions based on the detection data - only once
  useEffect(() => {
    if (detectionData && !hasInitializedRef.current) {
      const questions = [
        "What makes this email suspicious?",
        "Analyze the sender's reputation",
        "What actions should I take?",
        "Explain the risk level",
        "Show similar past incidents",
      ]
      setSuggestedQuestions(questions)
      hasInitializedRef.current = true
    }

    // Reset when detection data is cleared
    if (!detectionData) {
      hasInitializedRef.current = false
    }
  }, [detectionData])

  // Scroll to bottom of messages when new ones are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Generate a response based on the user's input and detection data
  const generateResponse = async (userInput: string) => {
    setIsLoading(true)

    // In a real implementation, this would call an AI service
    // For now, we'll simulate responses based on keywords

    let response = ""
    const inputLower = userInput.toLowerCase()

    // Simulate thinking time
    await new Promise((resolve) => setTimeout(resolve, 1000))

    if (inputLower.includes("suspicious") || inputLower.includes("why")) {
      response = `This email was flagged as suspicious for several reasons:
      
1. **Sender Anomaly**: The sender domain (${emailData?.basic?.sender || "suspicious-domain.com"}) has no prior communication history with your organization.

2. **Content Analysis**: The email contains urgent language and requests for sensitive information or financial action.

3. **Technical Indicators**: The email headers show routing through unusual servers, and the sender's IP address (${emailData?.metadata?.senderIP || "192.168.1.1"}) is associated with previous malicious activity.

4. **Authentication Failure**: The email failed SPF, DKIM, and DMARC checks, indicating possible spoofing.

I recommend investigating further before taking any action on the sender's request.`
    } else if (inputLower.includes("sender") || inputLower.includes("reputation")) {
      response = `The sender (${emailData?.basic?.sender || "suspicious@domain.com"}) has the following reputation metrics:

- **Domain Age**: 3 months (recently created)
- **Previous Detections**: 5 similar emails from this domain were blocked across our customer base
- **Reputation Score**: 15/100 (Poor)
- **Known Campaigns**: This sender appears to be part of the "FinancialPhish2023" campaign targeting financial departments

The sender has no prior communication history with your organization, which increases the suspicion level.`
    } else if (inputLower.includes("action") || inputLower.includes("recommend") || inputLower.includes("do")) {
      response = `Based on my analysis, I recommend the following actions:

1. **Do Not Respond** to the email or click any links
2. **Block the Sender Domain** organization-wide
3. **Alert the Security Team** about this detection
4. **Scan Endpoints** of any recipients who may have interacted with similar emails
5. **Update Security Awareness Training** to include this type of phishing attempt

Would you like me to help with any of these actions?`
    } else if (inputLower.includes("risk") || inputLower.includes("severity")) {
      response = `This detection has a **${detectionData?.severity || "High"}** risk level.

The severity is determined based on:
- Type of threat (credential phishing)
- Potential impact (financial loss, data breach)
- Sophistication of the attack
- Targeting of high-value employees

If successful, this attack could lead to account compromise, data exfiltration, or financial fraud.`
    } else if (inputLower.includes("similar") || inputLower.includes("past") || inputLower.includes("history")) {
      response = `I found 3 similar incidents in the past 30 days:

1. **DET-005** (2 weeks ago): Similar phishing attempt targeting finance department
2. **DET-012** (10 days ago): Email from same sender domain targeting HR
3. **DET-018** (3 days ago): Similar content pattern but different sender

The attack patterns suggest a coordinated campaign targeting your organization. I recommend reviewing these past incidents for additional context.`
    } else {
      response = `I don't have specific information about that query. Here are some aspects of this detection I can help with:

- Analyzing why the email is suspicious
- Providing sender reputation information
- Recommending actions to take
- Explaining the risk level
- Finding similar past incidents

Would you like me to elaborate on any of these topics?`
    }

    setIsLoading(false)

    return response
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    // Add user message
    const userMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")

    // Generate and add assistant response
    const response = await generateResponse(input)

    const assistantMessage: Message = {
      role: "assistant",
      content: response,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, assistantMessage])
  }

  const handleSuggestedQuestion = async (question: string) => {
    if (isLoading) return

    // Add user message
    const userMessage: Message = {
      role: "user",
      content: question,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])

    // Generate and add assistant response
    const response = await generateResponse(question)

    const assistantMessage: Message = {
      role: "assistant",
      content: response,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, assistantMessage])
  }

  // If not open, don't render anything
  if (!isOpen) {
    return null
  }

  return (
    <Card
      className={cn(
        "fixed bottom-4 right-4 w-96 shadow-xl transition-all duration-300 z-50",
        isMinimized ? "h-14" : "h-[500px]",
        className,
      )}
    >
      <CardHeader className="p-3 flex flex-row items-center justify-between space-y-0 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Security Copilot</CardTitle>
          <Badge variant="outline" className="ml-2 bg-green-500/10 text-green-500 border-green-500/20">
            Active
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsMinimized(!isMinimized)}>
            {isMinimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      {!isMinimized && (
        <>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <ScrollArea className="h-[400px] p-4">
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex flex-col max-w-[80%] rounded-lg p-3",
                      message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    <div className="whitespace-pre-line text-sm">{message.content}</div>
                    <span className="text-xs opacity-70 mt-1 ml-auto">
                      {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {suggestedQuestions.length > 0 && messages.length < 3 && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">Suggested questions:</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedQuestions.map((question, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleSuggestedQuestion(question)}
                        disabled={isLoading}
                      >
                        {question}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </ScrollArea>
          </CardContent>

          <CardFooter className="p-3 pt-0 border-t">
            <form onSubmit={handleSubmit} className="flex w-full gap-2">
              <Input
                placeholder="Ask a question..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
                className="flex-1"
              />
              <Button type="submit" size="icon" disabled={isLoading}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardFooter>
        </>
      )}
    </Card>
  )
}
