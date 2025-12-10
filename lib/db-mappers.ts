import {
  Detection,
  Investigation,
  Email,
  Attachment,
  Device,
  EndpointEvent,
} from "@/types/domain";

type DynamoItem = Record<string, any>;

const pickString = (attr: any, fallback = ""): string => {
  if (!attr) return fallback;
  if (typeof attr.S === "string") return attr.S;
  return fallback;
};

const pickNumber = (attr: any, fallback = 0): number => {
  if (!attr) return fallback;
  if (attr.N !== undefined) return Number(attr.N);
  return fallback;
};

const pickStringArray = (attr: any): string[] => {
  if (!attr) return [];
  if (Array.isArray(attr.SS)) return attr.SS;
  if (Array.isArray(attr.L)) return attr.L.map((x) => x.S).filter(Boolean);
  if (typeof attr.S === "string") return [attr.S];
  return [];
};

const pickJson = (attr: any): any => {
  if (!attr) return undefined;
  if (attr.S) {
    try {
      return JSON.parse(attr.S);
    } catch {
      return undefined;
    }
  }
  if (attr.M) return attr.M;
  return undefined;
};

export function mapDetectionItem(item: DynamoItem): Detection {
  return {
    id: pickString(item.detectionId),
    detectionId: pickString(item.detectionId),
    emailMessageId: pickString(item.emailMessageId),
    organizationId: pickString(item.organizationId),
    severity: (pickString(item.severity, "low") as Detection["severity"]),
    status: (pickString(item.status, "new") as Detection["status"]),
    name: pickString(item.name),
    description: pickString(item.description),
    sentBy: pickString(item.sentBy),
    assignedTo: pickStringArray(item.assignedTo),
    indicators: pickStringArray(item.indicators),
    recommendations: pickStringArray(item.recommendations),
    threatScore: pickNumber(item.threatScore),
    confidence: pickNumber(item.confidence),
    manualFlag: item.manualFlag?.BOOL ?? false,
    createdAt: pickString(item.createdAt),
    timestamp: pickString(item.timestamp || item.receivedAt),
  };
}

export function mapInvestigationItem(item: DynamoItem): Investigation {
  return {
    id: pickString(item.investigationId),
    investigationId: pickString(item.investigationId),
    emailMessageId: pickString(item.emailMessageId),
    organizationId: pickString(item.organizationId),
    status: (pickString(item.status, "active") as Investigation["status"]),
    priority: (pickString(item.priority, "medium") as Investigation["priority"]),
    investigatorId: pickString(item.investigatorId),
    investigatorName: pickString(item.investigatorName),
    createdAt: pickString(item.createdAt),
    updatedAt: pickString(item.updatedAt || item.createdAt),
    notes: pickStringArray(item.notes),
  };
}

export function mapAttachments(attr: any): Attachment[] {
  const list = pickJson(attr);
  if (!Array.isArray(list)) return [];
  return list.map((a) => ({
    id: a.id || a.filename || "",
    filename: a.filename || a.name || "",
    mimeType: a.mimeType || a.contentType || "application/octet-stream",
    size: a.size,
    verdict: a.verdict,
  }));
}

export function mapEmailItem(item: DynamoItem): Email {
  const rawS3Key = pickString(item.rawS3Key);
  return {
    id: pickString(item.emailId || item.messageId),
    messageId: pickString(item.messageId),
    organizationId: pickString(item.organizationId),
    subject: pickString(item.subject),
    from: pickString(item.from),
    to: pickStringArray(item.to),
    cc: pickStringArray(item.cc),
    date: pickString(item.timestamp || item.sentDate || item.createdAt),
    headers: pickJson(item.headers) || {},
    bodyPlain: pickString(item.body || item.bodyPlain),
    bodyHtml: pickString(item.htmlBody || item.bodyHtml),
    attachments: mapAttachments(item.attachments),
    rawS3Key: rawS3Key || undefined,
    createdAt: pickString(item.createdAt || item.timestamp),
  };
}

export function mapDeviceItem(item: DynamoItem): Device {
  return {
    id: pickString(item.deviceId),
    deviceId: pickString(item.deviceId),
    hostname: pickString(item.hostname),
    userEmail: pickString(item.userEmail),
    organizationId: pickString(item.organizationId),
    os: (pickString(item.os, "other") as Device["os"]),
    lastSeen: pickString(item.lastSeen),
    riskScore: pickNumber(item.riskScore),
    status: (pickString(item.status, "healthy") as Device["status"]),
  };
}

export function mapEndpointEventItem(item: DynamoItem): EndpointEvent {
  return {
    id: pickString(item.eventId || item.id),
    deviceId: pickString(item.deviceId),
    userEmail: pickString(item.userEmail),
    organizationId: pickString(item.organizationId),
    timestamp: pickString(item.timestamp),
    eventType: (pickString(item.eventType, "OTHER") as EndpointEvent["eventType"]),
    details: pickJson(item.details) || {},
    relatedEmailMessageId: pickString(item.relatedEmailMessageId, undefined as any),
  };
}
