import { Detection, EndpointEvent } from "@/types/domain";

interface RuleResult {
  matched: boolean;
  severity: Detection["severity"];
  reason: string;
  indicators?: string[];
}

const suspiciousProcesses = ["powershell.exe", "wscript.exe", "cmd.exe", "mshta.exe"];
const badDomains = ["malicious.test", "evil.example", "phish.local"];

/**
 * Simple rule-based detection for endpoint events.
 * Expand with richer heuristics or ML later.
 */
export function evaluateEventForDetection(
  event: EndpointEvent
): RuleResult {
  // PROCESS_START with suspicious executable and arguments
  if (
    event.eventType === "PROCESS_START" &&
    typeof event.details?.processName === "string" &&
    suspiciousProcesses.includes(event.details.processName.toLowerCase()) &&
    typeof event.details?.commandLine === "string" &&
    event.details.commandLine.toLowerCase().includes("http")
  ) {
    return {
      matched: true,
      severity: "high",
      reason: `Suspicious process ${event.details.processName} spawned with network-capable arguments`,
      indicators: [event.details.commandLine],
    };
  }

  // FILE_WRITE into startup folder
  if (
    event.eventType === "FILE_WRITE" &&
    typeof event.details?.path === "string" &&
    event.details.path.toLowerCase().includes("startup")
  ) {
    return {
      matched: true,
      severity: "medium",
      reason: `File write into startup folder: ${event.details.path}`,
      indicators: [event.details.path],
    };
  }

  // NETWORK_CONNECTION to known-bad domain
  if (
    event.eventType === "NETWORK_CONNECTION" &&
    typeof event.details?.domain === "string" &&
    badDomains.includes(event.details.domain.toLowerCase())
  ) {
    return {
      matched: true,
      severity: "critical",
      reason: `Connection to known-bad domain ${event.details.domain}`,
      indicators: [event.details.domain],
    };
  }

  return { matched: false, severity: "low", reason: "" };
}
