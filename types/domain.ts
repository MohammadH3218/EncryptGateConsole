// Centralized domain models for EncryptGate XDR
// Keep these interfaces aligned with DynamoDB + Neo4j attributes used across the app.

export type Severity = "low" | "medium" | "high" | "critical";
export type DetectionStatus = "new" | "in_progress" | "resolved" | "false_positive";
export type InvestigationStatus = "active" | "completed" | "escalated";
export type InvestigationPriority = "low" | "medium" | "high" | "critical";
export type DeviceOs = "windows" | "macos" | "linux" | "other";
export type DeviceStatus = "healthy" | "at_risk" | "compromised";
export type EndpointEventType = "PROCESS_START" | "FILE_WRITE" | "NETWORK_CONNECTION" | "LOGIN" | "OTHER";
export type AttachmentVerdict = "clean" | "suspicious" | "malicious" | "unknown";

export interface Detection {
  id: string;
  detectionId: string;
  emailMessageId: string;
  organizationId: string;
  severity: Severity;
  status: DetectionStatus;
  name: string;
  description: string;
  sentBy: string;
  assignedTo: string[];
  indicators: string[];
  recommendations: string[];
  threatScore: number;
  confidence: number;
  manualFlag: boolean;
  createdAt: string;
  timestamp: string;
}

export interface Investigation {
  id: string;
  investigationId: string;
  emailMessageId: string;
  organizationId: string;
  status: InvestigationStatus;
  priority: InvestigationPriority;
  investigatorId: string;
  investigatorName: string;
  createdAt: string;
  updatedAt: string;
  notes: string[];
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size?: number;
  verdict?: AttachmentVerdict;
}

export interface Email {
  id: string;
  messageId: string;
  organizationId: string;
  subject: string;
  from: string;
  to: string[];
  cc?: string[];
  date: string;
  headers: Record<string, string>;
  bodyPlain: string;
  bodyHtml: string;
  attachments: Attachment[];
  rawS3Key?: string;
  createdAt: string;
}

export interface Device {
  id: string;
  deviceId: string;
  hostname: string;
  userEmail: string;
  organizationId: string;
  os: DeviceOs;
  lastSeen: string;
  riskScore: number;
  status: DeviceStatus;
}

export interface EndpointEvent {
  id: string;
  deviceId: string;
  userEmail: string;
  organizationId: string;
  timestamp: string;
  eventType: EndpointEventType;
  details: Record<string, any>;
  relatedEmailMessageId?: string;
}

// Graph types used by graph-service helpers
export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, any>;
}

export interface GraphLink {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, any>;
}
