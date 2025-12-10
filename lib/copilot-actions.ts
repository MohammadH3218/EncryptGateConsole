import { Detection } from "@/types/domain";

const defaultHeaders = { "Content-Type": "application/json" };

async function jsonFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function getDetectionSummary({ detectionId }: { detectionId: string }) {
  const detection = await jsonFetch<Detection>(`/api/detections/${encodeURIComponent(detectionId)}`);
  return {
    detection,
    summary: `${detection.severity} detection for ${detection.sentBy}: ${detection.name}`,
  };
}

export async function queryEmailGraph(params: {
  senderEmail: string;
  timeRange?: string;
  minSeverity?: string;
}) {
  const body = {
    type: "sender_graph",
    params: {
      senderEmail: params.senderEmail,
      from: undefined,
      to: undefined,
      minSeverity: params.minSeverity,
    },
  };
  return jsonFetch(`/api/graph/query`, {
    method: "POST",
    headers: defaultHeaders,
    body: JSON.stringify(body),
  });
}

export async function listSimilarIncidents({ emailMessageId }: { emailMessageId: string }) {
  return jsonFetch(`/api/graph/query`, {
    method: "POST",
    headers: defaultHeaders,
    body: JSON.stringify({
      type: "campaign_for_email",
      params: { emailId: emailMessageId },
    }),
  });
}

export async function updateDetectionStatus({
  detectionId,
  newStatus,
}: {
  detectionId: string;
  newStatus: string;
}) {
  return jsonFetch(`/api/detections/${encodeURIComponent(detectionId)}/status`, {
    method: "PATCH",
    headers: defaultHeaders,
    body: JSON.stringify({ status: newStatus }),
  });
}

export async function getDeviceActivityAction({
  deviceId,
  timeRange,
}: {
  deviceId: string;
  timeRange?: { from?: string; to?: string };
}) {
  return jsonFetch(`/api/graph/query`, {
    method: "POST",
    headers: defaultHeaders,
    body: JSON.stringify({
      type: "device_activity",
      params: { deviceId, from: timeRange?.from, to: timeRange?.to },
    }),
  });
}
