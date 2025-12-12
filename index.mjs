// index.mjs — Node.js 20+/22
// Enhanced SES->S3->Lambda flow with improved MIME parsing

import { WorkMailMessageFlowClient, GetRawMessageContentCommand } from "@aws-sdk/client-workmailmessageflow";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const REGION = process.env.AWS_REGION || "us-east-1";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://console-encryptgate.net/api/workmail-webhook";
const WORKMAIL_ORG_ID = process.env.WORKMAIL_ORG_ID || null; // WorkMail organization ID for lookup
const VERSION = "enhanced-ses-s3-v2.3";

const workmail = new WorkMailMessageFlowClient({ region: REGION });
const s3 = new S3Client({ region: REGION });

const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ level, msg, version: VERSION, ts: new Date().toISOString(), ...extra }));

/* ---------------- ENHANCED MIME helpers ---------------- */
function decodeQP(s) {
  return s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseHeaders(raw) {
  const lines = raw.split(/\r?\n/);
  const headers = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") break;
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).toLowerCase().trim();
      let val = line.slice(idx + 1).trim();
      while (i + 1 < lines.length && (/^[ \t]/.test(lines[i + 1]))) {
        i++;
        val += " " + lines[i].trim();
      }
      headers[key] = val;
    }
  }
  return headers;
}

function extractAddress(h) {
  if (!h) return null;
  const m = h.match(/<([^>]+)>/);
  return (m ? m[1] : h).trim();
}

function decodeBody(body, enc) {
  if (!body) return "";
  try {
    if (enc === "base64") {
      return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8");
    }
    if (enc === "quoted-printable") {
      return decodeQP(body);
    }
  } catch (error) {
    log("warn", "Body decoding failed", { encoding: enc, error: error.message });
  }
  return body;
}

/* --------- REPLACED: Improved extractBodyFromMime --------- */
// Replace the extractBodyFromMime function in your Lambda with this improved version
function extractBodyFromMime(raw) {
  if (!raw || raw.trim().length === 0) {
    return "No email content available";
  }

  const split = raw.split(/\r?\n\r?\n/);
  if (split.length < 2) {
    log("warn", "Invalid MIME format", { splitLength: split.length });
    return "Invalid email format";
  }

  const headTxt = split.shift();
  let body = split.join("\n\n");

  const ct = (headTxt.match(/content-type:\s*([^\r\n]+)/i)?.[1] || "").toLowerCase();
  const enc = (headTxt.match(/content-transfer-encoding:\s*([^\r\n]+)/i)?.[1] || "").toLowerCase();

  log("info", "MIME analysis", { contentType: ct, encoding: enc, bodyLength: body.length });

  // Enhanced multipart detection and parsing
  if (ct.includes("multipart/") || body.includes("Content-Type:")) {
    let boundary = null;

    // Try to find boundary in content-type header
    const boundaryMatch = ct.match(/boundary="?([^";\r\n]+)"?/);
    if (boundaryMatch) {
      boundary = boundaryMatch[1];
    } else {
      // Try to find boundary pattern in the body
      const bodyBoundaryMatch = body.match(/--([a-f0-9]{12,})/);
      if (bodyBoundaryMatch) {
        boundary = bodyBoundaryMatch[1];
      }
    }

    log("info", "Processing multipart content", { boundary, hasBoundary: !!boundary });

    if (boundary) {
      // Split by boundary
      const parts = body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, "g"));

      let bestText = "";
      let bestHtml = "";

      for (const part of parts) {
        if (!part.trim() || part.includes('--')) continue;

        // Look for Content-Type in this part
        const isPlainText = part.includes('Content-Type: text/plain');
        const isHtml = part.includes('Content-Type: text/html');

        if (isPlainText || isHtml) {
          // Extract content after the Content-Type line
          const lines = part.split('\n');
          let contentStarted = false;
          let content = [];

          for (const line of lines) {
            if (contentStarted) {
              if (content.length === 0 && !line.trim()) continue;
              content.push(line);
            } else if (line.includes('Content-Type:') || line.includes('charset=')) {
              contentStarted = true;
            }
          }

          const extractedContent = content.join('\n').trim();

          if (isPlainText && extractedContent && !bestText) {
            bestText = extractedContent;
            log("info", "Found plain text content", { length: bestText.length, preview: bestText.substring(0, 100) });
          } else if (isHtml && extractedContent && !bestHtml) {
            bestHtml = extractedContent;
            log("info", "Found HTML content", { length: bestHtml.length, preview: bestHtml.substring(0, 100) });
          }
        }
      }

      if (bestText) {
        return bestText;
      } else if (bestHtml) {
        return stripHtml(bestHtml);
      }
    }

    // Fallback: Use aggressive regex to extract readable content
    log("warn", "Using aggressive fallback extraction");

    // Remove all MIME boundaries and headers
    let cleanBody = body
      .replace(/--[a-f0-9]{12,}(--)?\s*/g, '') // Remove boundaries like --000000000000423d94063c96f451
      .replace(/Content-Type:\s*[^\r\n]+/gi, '') // Remove Content-Type lines
      .replace(/Content-Transfer-Encoding:\s*[^\r\n]+/gi, '') // Remove encoding lines
      .replace(/charset="?[^"\r\n]+"?/gi, '') // Remove charset specifications
      .replace(/^\s*$/gm, '') // Remove empty lines
      .trim();

    const contentLines = cleanBody.split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed &&
               !trimmed.startsWith('Content-') &&
               !trimmed.startsWith('MIME-') &&
               !trimmed.match(/^--[a-f0-9]+/) &&
               !trimmed.match(/charset=/) &&
               trimmed.length > 1;
      })
      .map(line => line.trim());

    if (contentLines.length > 0) {
      const result = contentLines.join(' ').trim();
      log("info", "Extracted content using fallback", {
        result,
        length: result.length,
        originalLines: contentLines.length
      });
      return result;
    }

    return "No readable content found in multipart message";
  } else {
    // Single part message
    body = decodeBody(body, enc).trim();
    if (!body) return "No message content available";

    if (ct.includes("text/html") || /<\/?[a-z][\s\S]*>/i.test(body)) {
      return stripHtml(body);
    }
    return body;
  }
}

// Also add this helper function for even more aggressive cleaning if needed
function aggressiveContentExtraction(text) {
  return text
    .split(/\n/)
    .filter(line => {
      const trimmed = line.trim();
      return trimmed &&
             trimmed.length > 3 &&
             !trimmed.match(/^(Content-|MIME-|--[a-f0-9])/i) &&
             !trimmed.match(/charset=|boundary=/i) &&
             !/^[a-f0-9-]+$/i.test(trimmed);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* -------------- Enhanced S3 helpers -------------- */
async function getS3ObjectUtf8(bucket, key) {
  try {
    log("info", "Fetching S3 object", { bucket, key });
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const res = await s3.send(cmd);

    const bytes = res.Body?.transformToByteArray
      ? await res.Body.transformToByteArray()
      : await streamToBuffer(res.Body);

    const content = Buffer.from(bytes).toString("utf8");
    log("info", "S3 object fetched", { bucket, key, size: content.length });
    return content;
  } catch (error) {
    log("error", "S3 fetch failed", { bucket, key, error: error.message });
    throw new Error(`Failed to fetch S3 object: ${error.message}`);
  }
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/* -------------- WorkMail helpers (fallback) -------------- */
async function getWorkMailMime(messageId) {
  log("info", "GetRawMessageContent", { messageId });
  const cmd = new GetRawMessageContentCommand({ messageId });
  const res = await workmail.send(cmd);
  const chunks = [];
  for await (const c of res.messageContent) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  log("info", "MIME fetched", { messageId, bytes: raw.length });
  return raw;
}

/* -------------- SES (limited) payload -------------- */
function buildSESPayload(record, requestId) {
  const mail = record.ses.mail;
  const subject = mail.commonHeaders?.subject || "No Subject";
  const sender = mail.source || "unknown@email.com";
  const recipients = Array.isArray(mail.destination) ? mail.destination : [mail.destination].filter(Boolean);
  const timestamp = mail.timestamp || new Date().toISOString();

  const bodyText = `Email received via SES (limited content available)
Subject: ${subject}
From: ${sender}
To: ${recipients.join(", ")}

Note: This is metadata-only processing. For full content, ensure SES->S3->Lambda flow is configured.`;

  return {
    messageId: mail.messageId,
    subject,
    flowDirection: "INBOUND",
    organizationId: WORKMAIL_ORG_ID, // Pass WorkMail org ID for lookup
    envelope: {
      mailFrom: sender,
      recipients,
      organizationId: WORKMAIL_ORG_ID // Also in envelope as fallback
    },
    timestamp,
    raw: {
      base64: Buffer.from(
        `Subject: ${subject}\nFrom: ${sender}\nTo: ${recipients.join(", ")}\n\n${bodyText}`
      ).toString("base64"),
    },
    extractedBody: bodyText,
    processingInfo: {
      version: VERSION,
      extractionMethod: "SES_LIMITED_FALLBACK",
      requestId,
      contentType: "SES_METADATA_ONLY",
      warning: "Limited content - configure S3 processing for full email content"
    },
  };
}

/* -------------- Enhanced Webhook POST -------------- */
async function postToWebhook(payload, reqId, methodTag) {
  log("info", "POST → webhook", { reqId, methodTag, bytes: JSON.stringify(payload).length });

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Lambda-Request-ID": reqId,
        "X-Processing-Method": methodTag,
        "X-Version": VERSION,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text().catch(() => "");
    log(res.ok ? "info" : "error", "Webhook response", {
      reqId,
      status: res.status,
      body: text.slice(0, 400),
      success: res.ok
    });

    if (!res.ok) {
      throw new Error(`Webhook failed ${res.status}: ${text}`);
    }

    return { success: true, status: res.status, body: text };
  } catch (error) {
    log("error", "Webhook request failed", { reqId, error: error.message });
    throw error;
  }
}

/* -------------- ENHANCED HANDLER -------------- */
export const handler = async (event, context) => {
  const requestId = context?.awsRequestId || Math.random().toString(36).slice(2);

  const isSES = event?.Records?.[0]?.eventSource === "aws:ses";
  const isS3 = event?.Records?.[0]?.eventSource === "aws:s3";
  const isWorkMail = !!(event?.messageId) && !!(event?.envelope);

  log("info", "Lambda triggered", {
    requestId,
    eventKeys: Object.keys(event || {}),
    isWorkMail,
    isSES,
    isS3,
    eventSource: event?.Records?.[0]?.eventSource,
    workmailOrgId: WORKMAIL_ORG_ID
  });

  try {
    if (isS3) {
      const rec = event.Records[0];
      const bucket = rec.s3.bucket.name;
      const key = decodeURIComponent(rec.s3.object.key.replace(/\+/g, " "));

      log("info", "S3 event processing", { bucket, key, size: rec.s3.object.size });

      if (!bucket || !key) {
        throw new Error("Missing S3 bucket or key information");
      }

      const raw = await getS3ObjectUtf8(bucket, key);
      if (!raw || raw.length === 0) {
        throw new Error("Empty email content received from S3");
      }

      const headers = parseHeaders(raw);
      const subject = headers["subject"] || "No Subject";
      const sender = extractAddress(headers["from"]) || "unknown@email.com";

      const rcpts = [];
      if (headers["to"]) rcpts.push(...headers["to"].split(",").map(extractAddress).filter(Boolean));
      if (headers["cc"]) rcpts.push(...headers["cc"].split(",").map(extractAddress).filter(Boolean));
      if (headers["bcc"]) rcpts.push(...headers["bcc"].split(",").map(extractAddress).filter(Boolean));

      const body = extractBodyFromMime(raw);

      if (!body || body.trim().length === 0) {
        log("warn", "No body content extracted", {
          messageId: headers["message-id"],
          rawLength: raw.length,
          hasHeaders: Object.keys(headers).length > 0
        });
      } else {
        log("info", "Body extraction successful", {
          bodyLength: body.length,
          bodyPreview: body.substring(0, 200),
          hasCleanContent: !body.includes("--") && !body.includes("Content-Type:")
        });
      }

      const payload = {
        messageId: headers["message-id"] || `s3-${Date.now()}`,
        subject,
        flowDirection: "INBOUND",
        organizationId: WORKMAIL_ORG_ID, // Pass WorkMail org ID for webhook to lookup
        envelope: {
          mailFrom: sender,
          recipients: rcpts.filter(Boolean).length > 0 ? rcpts.filter(Boolean) : [sender],
          organizationId: WORKMAIL_ORG_ID // Also in envelope as fallback
        },
        timestamp: headers["date"] ? new Date(headers["date"]).toISOString() : new Date().toISOString(),
        raw: { base64: Buffer.from(raw, "utf8").toString("base64") },
        extractedBody: body,
        processingInfo: {
          version: VERSION,
          extractionMethod: "SES_S3_ENHANCED",
          requestId,
          headersExtracted: Object.keys(headers).length,
          bodyExtracted: body.length > 0,
          bodyLength: body.length,
          contentType: "FULL_EMAIL_CONTENT",
          s3: { bucket, key, size: raw.length },
        },
      };

      log("info", "S3 processing complete", {
        messageId: payload.messageId,
        subject: payload.subject,
        sender: payload.envelope.mailFrom,
        recipients: payload.envelope.recipients.length,
        bodyLength: payload.extractedBody.length,
        organizationId: WORKMAIL_ORG_ID,
        hasRealContent: payload.extractedBody.length > 10 &&
                       !payload.extractedBody.includes("No email content available") &&
                       !payload.extractedBody.includes("--") &&
                       !payload.extractedBody.includes("Content-Type:")
      });

      await postToWebhook(payload, requestId, payload.processingInfo.extractionMethod);
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          path: "S3_ENHANCED",
          messageId: payload.messageId,
          bodyLength: payload.extractedBody.length,
          bodyPreview: payload.extractedBody.substring(0, 100),
          success: true
        })
      };
    }

    if (isSES) {
      log("warn", "Using SES fallback - configure S3 processing for full content");
      const sesRecord = event.Records[0];
      const payload = buildSESPayload(sesRecord, requestId);
      await postToWebhook(payload, requestId, payload.processingInfo.extractionMethod);
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          path: "SES_FALLBACK",
          warning: "Limited content - configure S3 processing"
        })
      };
    }

    if (isWorkMail) {
      log("info", "WorkMail Message Flow processing");
      const { messageId, envelope, flowDirection, orgId } = event;

      const raw = await getWorkMailMime(messageId);
      const headers = parseHeaders(raw);
      const subject = headers["subject"] || "No Subject";
      const sender = extractAddress(headers["from"]) || envelope?.mailFrom || "unknown@email.com";
      const rcpts = envelope?.recipients?.length
        ? envelope.recipients
        : (headers["to"] ? [extractAddress(headers["to"])] : []);
      const body = extractBodyFromMime(raw);

      const payload = {
        messageId,
        subject,
        flowDirection: flowDirection || "INBOUND",
        organizationId: WORKMAIL_ORG_ID, // Use env var instead of event orgId
        envelope: {
          mailFrom: sender,
          recipients: rcpts,
          organizationId: WORKMAIL_ORG_ID // Also in envelope
        },
        timestamp: new Date().toISOString(),
        raw: { base64: Buffer.from(raw).toString("base64") },
        extractedBody: body,
        processingInfo: {
          version: VERSION,
          extractionMethod: "WORKMAIL_MESSAGE_FLOW",
          requestId,
          headersExtracted: Object.keys(headers).length,
          bodyExtracted: body.length > 0,
          contentType: "WORKMAIL_CONTENT",
        },
      };

      await postToWebhook(payload, requestId, payload.processingInfo.extractionMethod);
      return { disposition: "CONTINUE" };
    }

    log("warn", "Unknown event type", { requestId, sample: JSON.stringify(event).slice(0, 400) });
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: false,
        reason: "unknown_event_type",
        supportedTypes: ["S3", "SES", "WorkMail"]
      })
    };

  } catch (err) {
    log("error", "Processing failed", {
      requestId,
      error: err.message,
      stack: err.stack?.split('\n').slice(0, 3)
    });

    if (event?.messageId && event?.envelope) {
      return { disposition: "CONTINUE" };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: err.message,
        requestId,
        timestamp: new Date().toISOString()
      })
    };
  }
};
