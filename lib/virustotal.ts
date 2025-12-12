/**
 * VirusTotal Integration Module
 *
 * Provides hash-first attachment scanning with upload fallback
 * For EncryptGate threat detection pipeline
 *
 * NOTE: This module uses DynamoDB caching for domains and files (not IPs)
 * IPs are NOT cached as they change frequently for legitimate users
 */

import crypto from 'crypto';
import { getConfig } from './config';
import {
  getCachedDomainReport,
  getCachedFileReport,
} from './virustotal-cache';

// VirusTotal API configuration
const VT_BASE_URL = 'https://www.virustotal.com/api/v3';
const VT_FILE_REPORT_URL = `${VT_BASE_URL}/files`;
const VT_URL_REPORT_URL = `${VT_BASE_URL}/urls`;
const VT_ANALYSIS_URL = `${VT_BASE_URL}/analyses`;
const VT_DOMAIN_URL = `${VT_BASE_URL}/domains`;
const VT_IP_URL = `${VT_BASE_URL}/ip_addresses`;

export type VTVerdict = 'CLEAN' | 'SUSPICIOUS' | 'MALICIOUS' | 'UNKNOWN' | 'ERROR';

export interface VTStats {
  harmless: number;
  malicious: number;
  suspicious: number;
  undetected: number;
  timeout: number;
}

export interface VTFileResult {
  verdict: VTVerdict;
  stats: VTStats;
  permalink: string;
  sha256: string;
  scan_id?: string;
  analysis_id?: string;
  scan_date?: string;
  error?: string;
}

export interface VTURLResult {
  verdict: VTVerdict;
  stats: VTStats;
  permalink: string;
  url: string;
  scan_id?: string;
  analysis_id?: string;
  error?: string;
}

export interface VTDomainResult {
  verdict: VTVerdict;
  stats: VTStats;
  permalink: string;
  domain: string;
  reputation: number;
  categories: Record<string, string>;
  popularity_ranks?: Record<string, number>;
  last_analysis_date?: string;
  error?: string;
}

export interface VTIPResult {
  verdict: VTVerdict;
  stats: VTStats;
  permalink: string;
  ip: string;
  reputation: number;
  country?: string;
  asn?: number;
  as_owner?: string;
  last_analysis_date?: string;
  error?: string;
}

/**
 * Compute SHA-256 hash of file buffer
 */
export function computeSHA256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Get VirusTotal API key from config
 */
async function getVTApiKey(): Promise<string> {
  const config = await getConfig();
  const apiKey = config.VIRUSTOTAL_API_KEY || process.env.VIRUSTOTAL_API_KEY;

  if (!apiKey) {
    throw new Error('VirusTotal API key not configured');
  }

  return apiKey;
}

/**
 * Make authenticated request to VirusTotal API
 */
async function vtRequest(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any
): Promise<any> {
  const apiKey = await getVTApiKey();

  const headers: Record<string, string> = {
    'x-apikey': apiKey,
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    if (body instanceof FormData) {
      // Let fetch set Content-Type with boundary for FormData
      options.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  const response = await fetch(endpoint, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `VirusTotal API error (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

/**
 * Convert VT stats to verdict
 */
function statsToVerdict(stats: VTStats | null): VTVerdict {
  if (!stats) return 'UNKNOWN';

  if (stats.malicious > 0) return 'MALICIOUS';
  if (stats.suspicious > 0) return 'SUSPICIOUS';
  if (stats.harmless > 0 || stats.undetected > 0) return 'CLEAN';

  return 'UNKNOWN';
}

/**
 * Extract stats from VirusTotal response
 */
function extractStats(data: any): VTStats {
  const stats = data?.data?.attributes?.last_analysis_stats || {};

  return {
    harmless: stats.harmless || 0,
    malicious: stats.malicious || 0,
    suspicious: stats.suspicious || 0,
    undetected: stats.undetected || 0,
    timeout: stats.timeout || 0,
  };
}

/**
 * Get file report by SHA-256 hash
 *
 * @param sha256 - File hash
 * @returns File scan result or null if not found
 */
export async function getFileReport(sha256: string): Promise<VTFileResult | null> {
  try {
    console.log(`[VirusTotal] Checking hash: ${sha256}`);

    const data = await vtRequest(`${VT_FILE_REPORT_URL}/${sha256}`, 'GET');

    const stats = extractStats(data);
    const verdict = statsToVerdict(stats);
    const permalink = `https://www.virustotal.com/gui/file/${sha256}`;
    const scanDate = data?.data?.attributes?.last_analysis_date;

    console.log(`[VirusTotal] Hash found - Verdict: ${verdict}`);

    return {
      verdict,
      stats,
      permalink,
      sha256,
      scan_date: scanDate ? new Date(scanDate * 1000).toISOString() : undefined,
    };

  } catch (error: any) {
    // 404 means file not in VT database
    if (error.message?.includes('404')) {
      console.log(`[VirusTotal] Hash not found: ${sha256}`);
      return null;
    }

    console.error(`[VirusTotal] Error checking hash:`, error);
    throw error;
  }
}

/**
 * Upload file to VirusTotal for scanning
 *
 * @param fileBuffer - File content as Buffer
 * @param filename - Original filename
 * @returns Analysis ID for polling
 */
export async function uploadFile(
  fileBuffer: Buffer,
  filename: string
): Promise<string> {
  try {
    console.log(`[VirusTotal] Uploading file: ${filename} (${fileBuffer.length} bytes)`);

    // Create form data
    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, filename);

    const data = await vtRequest(`${VT_FILE_REPORT_URL}`, 'POST', formData);

    const analysisId = data?.data?.id;
    if (!analysisId) {
      throw new Error('No analysis ID returned from upload');
    }

    console.log(`[VirusTotal] Upload successful - Analysis ID: ${analysisId}`);
    return analysisId;

  } catch (error) {
    console.error(`[VirusTotal] Upload error:`, error);
    throw error;
  }
}

/**
 * Poll analysis result
 *
 * @param analysisId - Analysis ID from upload
 * @param maxAttempts - Maximum polling attempts (default: 10)
 * @param delayMs - Delay between attempts in ms (default: 5000)
 * @returns File scan result
 */
export async function pollAnalysis(
  analysisId: string,
  maxAttempts: number = 10,
  delayMs: number = 5000
): Promise<VTFileResult> {
  console.log(`[VirusTotal] Polling analysis: ${analysisId}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const data = await vtRequest(`${VT_ANALYSIS_URL}/${analysisId}`, 'GET');

      const status = data?.data?.attributes?.status;
      console.log(`[VirusTotal] Analysis status (attempt ${attempt}/${maxAttempts}): ${status}`);

      if (status === 'completed') {
        const stats = extractStats(data);
        const verdict = statsToVerdict(stats);

        // Get SHA-256 from meta if available
        const sha256 = data?.meta?.file_info?.sha256 || 'unknown';
        const permalink = `https://www.virustotal.com/gui/file/${sha256}`;

        console.log(`[VirusTotal] Analysis completed - Verdict: ${verdict}`);

        return {
          verdict,
          stats,
          permalink,
          sha256,
          analysis_id: analysisId,
        };
      }

      // Wait before next attempt
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

    } catch (error) {
      console.error(`[VirusTotal] Polling error (attempt ${attempt}):`, error);

      if (attempt === maxAttempts) {
        throw error;
      }
    }
  }

  // Polling timed out
  console.warn(`[VirusTotal] Analysis polling timed out after ${maxAttempts} attempts`);

  return {
    verdict: 'UNKNOWN',
    stats: { harmless: 0, malicious: 0, suspicious: 0, undetected: 0, timeout: 0 },
    permalink: '',
    sha256: 'unknown',
    analysis_id: analysisId,
    error: 'Analysis polling timed out',
  };
}

/**
 * Scan file with hash-first strategy
 *
 * 1. Compute SHA-256 hash
 * 2. Check if hash exists in VT database
 * 3. If not found, upload file and poll for results
 *
 * @param fileBuffer - File content as Buffer
 * @param filename - Original filename
 * @returns File scan result
 */
export async function scanFile(
  fileBuffer: Buffer,
  filename: string
): Promise<VTFileResult> {
  try {
    // Step 1: Compute hash
    const sha256 = computeSHA256(fileBuffer);
    console.log(`[VirusTotal] Scanning file: ${filename} (SHA-256: ${sha256})`);

    // Step 2: Check cached or VT database
    const existingReport = await getCachedFileReport(sha256);

    if (existingReport) {
      console.log(`[VirusTotal] Using cached/existing result for ${filename}`);
      return existingReport;
    }

    // Step 3: Upload and poll
    console.log(`[VirusTotal] Hash not found, uploading ${filename}`);
    const analysisId = await uploadFile(fileBuffer, filename);

    // Poll for results (with timeout)
    const result = await pollAnalysis(analysisId);

    return result;

  } catch (error: any) {
    console.error(`[VirusTotal] Scan error for ${filename}:`, error);

    return {
      verdict: 'ERROR',
      stats: { harmless: 0, malicious: 0, suspicious: 0, undetected: 0, timeout: 0 },
      permalink: '',
      sha256: computeSHA256(fileBuffer),
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Scan URL for malicious content
 *
 * @param url - URL to scan
 * @returns URL scan result
 */
export async function scanURL(url: string): Promise<VTURLResult> {
  try {
    console.log(`[VirusTotal] Scanning URL: ${url}`);

    // Submit URL for scanning
    const formData = new FormData();
    formData.append('url', url);

    const submitData = await vtRequest(VT_URL_REPORT_URL, 'POST', formData);
    const analysisId = submitData?.data?.id;

    if (!analysisId) {
      throw new Error('No analysis ID returned from URL submission');
    }

    // Poll for results
    await new Promise(resolve => setTimeout(resolve, 2000)); // Initial delay

    for (let attempt = 1; attempt <= 5; attempt++) {
      const data = await vtRequest(`${VT_ANALYSIS_URL}/${analysisId}`, 'GET');
      const status = data?.data?.attributes?.status;

      if (status === 'completed') {
        const stats = extractStats(data);
        const verdict = statsToVerdict(stats);

        // Compute URL ID for permalink
        const urlId = Buffer.from(url).toString('base64').replace(/=/g, '');
        const permalink = `https://www.virustotal.com/gui/url/${urlId}`;

        console.log(`[VirusTotal] URL scan completed - Verdict: ${verdict}`);

        return {
          verdict,
          stats,
          permalink,
          url,
          analysis_id: analysisId,
        };
      }

      if (attempt < 5) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Timeout
    return {
      verdict: 'UNKNOWN',
      stats: { harmless: 0, malicious: 0, suspicious: 0, undetected: 0, timeout: 0 },
      permalink: '',
      url,
      error: 'URL scan timed out',
    };

  } catch (error: any) {
    console.error(`[VirusTotal] URL scan error:`, error);

    return {
      verdict: 'ERROR',
      stats: { harmless: 0, malicious: 0, suspicious: 0, undetected: 0, timeout: 0 },
      permalink: '',
      url,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Batch scan multiple files
 *
 * @param files - Array of {buffer, filename} objects
 * @returns Array of scan results
 */
export async function scanMultipleFiles(
  files: Array<{ buffer: Buffer; filename: string }>
): Promise<VTFileResult[]> {
  console.log(`[VirusTotal] Batch scanning ${files.length} files`);

  const results = await Promise.all(
    files.map(({ buffer, filename }) => scanFile(buffer, filename))
  );

  const maliciousCount = results.filter(r => r.verdict === 'MALICIOUS').length;
  const suspiciousCount = results.filter(r => r.verdict === 'SUSPICIOUS').length;

  console.log(
    `[VirusTotal] Batch scan complete - ` +
    `${maliciousCount} malicious, ${suspiciousCount} suspicious`
  );

  return results;
}

/**
 * Convert VT verdict to numeric score for risk fusion
 *
 * Used by threat detection pipeline to compute final score
 */
export function verdictToScore(verdict: VTVerdict): number {
  switch (verdict) {
    case 'MALICIOUS':
      return 1.0;
    case 'SUSPICIOUS':
      return 0.7;
    case 'CLEAN':
      return 0.0;
    case 'UNKNOWN':
      return 0.2; // Small uncertainty penalty
    case 'ERROR':
      return 0.2; // Treat errors as uncertain
    default:
      return 0.2;
  }
}

/**
 * Get aggregate verdict for multiple scans
 *
 * Returns worst verdict from all scans
 */
export function aggregateVerdicts(verdicts: VTVerdict[]): VTVerdict {
  if (verdicts.includes('MALICIOUS')) return 'MALICIOUS';
  if (verdicts.includes('SUSPICIOUS')) return 'SUSPICIOUS';
  if (verdicts.includes('ERROR')) return 'ERROR';
  if (verdicts.includes('UNKNOWN')) return 'UNKNOWN';
  return 'CLEAN';
}

/**
 * Get domain reputation report from VirusTotal
 *
 * @param domain - Domain name (e.g., "example.com")
 * @returns Domain analysis result
 */
export async function getDomainReport(domain: string): Promise<VTDomainResult> {
  try {
    console.log(`[VirusTotal] Checking domain: ${domain}`);

    const data = await vtRequest(`${VT_DOMAIN_URL}/${domain}`, 'GET');

    const stats = extractStats(data);
    const verdict = statsToVerdict(stats);
    const permalink = `https://www.virustotal.com/gui/domain/${domain}`;

    // Extract reputation score (VirusTotal provides this as a number)
    const reputation = data?.data?.attributes?.reputation || 0;

    // Extract categories (e.g., "malware", "phishing", "safe")
    const categories = data?.data?.attributes?.categories || {};

    // Extract popularity ranks (Alexa, etc.)
    const popularityRanks = data?.data?.attributes?.popularity_ranks || {};

    // Last analysis date
    const lastAnalysisDate = data?.data?.attributes?.last_analysis_date;

    console.log(
      `[VirusTotal] Domain ${domain} - Verdict: ${verdict} | ` +
      `Reputation: ${reputation} | Categories: ${Object.keys(categories).length}`
    );

    return {
      verdict,
      stats,
      permalink,
      domain,
      reputation,
      categories,
      popularity_ranks: popularityRanks,
      last_analysis_date: lastAnalysisDate ? new Date(lastAnalysisDate * 1000).toISOString() : undefined,
    };

  } catch (error: any) {
    // Domain not found is common and not necessarily an error
    if (error.message?.includes('404')) {
      console.log(`[VirusTotal] Domain not found in database: ${domain}`);
      return {
        verdict: 'UNKNOWN',
        stats: { harmless: 0, malicious: 0, suspicious: 0, undetected: 0, timeout: 0 },
        permalink: `https://www.virustotal.com/gui/domain/${domain}`,
        domain,
        reputation: 0,
        categories: {},
      };
    }

    console.error(`[VirusTotal] Domain check error:`, error);

    return {
      verdict: 'ERROR',
      stats: { harmless: 0, malicious: 0, suspicious: 0, undetected: 0, timeout: 0 },
      permalink: '',
      domain,
      reputation: 0,
      categories: {},
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Get IP address reputation report from VirusTotal
 *
 * @param ip - IP address (e.g., "1.2.3.4")
 * @returns IP analysis result
 */
export async function getIPReport(ip: string): Promise<VTIPResult> {
  try {
    console.log(`[VirusTotal] Checking IP: ${ip}`);

    const data = await vtRequest(`${VT_IP_URL}/${ip}`, 'GET');

    const stats = extractStats(data);
    const verdict = statsToVerdict(stats);
    const permalink = `https://www.virustotal.com/gui/ip-address/${ip}`;

    // Extract reputation score
    const reputation = data?.data?.attributes?.reputation || 0;

    // Extract geolocation info
    const country = data?.data?.attributes?.country || undefined;

    // Extract ASN (Autonomous System Number)
    const asn = data?.data?.attributes?.asn || undefined;
    const asOwner = data?.data?.attributes?.as_owner || undefined;

    // Last analysis date
    const lastAnalysisDate = data?.data?.attributes?.last_analysis_date;

    console.log(
      `[VirusTotal] IP ${ip} - Verdict: ${verdict} | ` +
      `Reputation: ${reputation} | Country: ${country || 'Unknown'} | ASN: ${asn || 'Unknown'}`
    );

    return {
      verdict,
      stats,
      permalink,
      ip,
      reputation,
      country,
      asn,
      as_owner: asOwner,
      last_analysis_date: lastAnalysisDate ? new Date(lastAnalysisDate * 1000).toISOString() : undefined,
    };

  } catch (error: any) {
    // IP not found is common and not necessarily an error
    if (error.message?.includes('404')) {
      console.log(`[VirusTotal] IP not found in database: ${ip}`);
      return {
        verdict: 'UNKNOWN',
        stats: { harmless: 0, malicious: 0, suspicious: 0, undetected: 0, timeout: 0 },
        permalink: `https://www.virustotal.com/gui/ip-address/${ip}`,
        ip,
        reputation: 0,
      };
    }

    console.error(`[VirusTotal] IP check error:`, error);

    return {
      verdict: 'ERROR',
      stats: { harmless: 0, malicious: 0, suspicious: 0, undetected: 0, timeout: 0 },
      permalink: '',
      ip,
      reputation: 0,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Scan multiple domains in batch (with caching)
 *
 * @param domains - Array of domain names
 * @returns Array of domain results
 */
export async function scanMultipleDomains(domains: string[]): Promise<VTDomainResult[]> {
  console.log(`[VirusTotal] Batch scanning ${domains.length} domains (with cache)`);

  const results = await Promise.all(
    domains.map(domain => getCachedDomainReport(domain))
  );

  const maliciousCount = results.filter(r => r.verdict === 'MALICIOUS').length;
  const suspiciousCount = results.filter(r => r.verdict === 'SUSPICIOUS').length;

  console.log(
    `[VirusTotal] Domain batch scan complete - ` +
    `${maliciousCount} malicious, ${suspiciousCount} suspicious`
  );

  return results;
}

/**
 * Extract domain from email address or URL
 *
 * @param input - Email address or URL
 * @returns Domain name or null
 */
export function extractDomain(input: string): string | null {
  try {
    // Check if it's an email address
    if (input.includes('@')) {
      const parts = input.split('@');
      return parts[1] || null;
    }

    // Check if it's a URL
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const url = new URL(input);
      return url.hostname;
    }

    // Assume it's already a domain
    return input;

  } catch (error) {
    console.warn(`[VirusTotal] Failed to extract domain from: ${input}`);
    return null;
  }
}

/**
 * Comprehensive email sender analysis
 *
 * Checks domain reputation (cached) and IP address (not cached)
 * NOTE: IPs are NOT cached as they change frequently for legitimate users
 *
 * @param senderEmail - Sender email address
 * @param senderIP - Optional sender IP address
 * @returns Combined analysis result
 */
export async function analyzeSender(
  senderEmail: string,
  senderIP?: string
): Promise<{
  domain: VTDomainResult | null;
  ip: VTIPResult | null;
  combined_verdict: VTVerdict;
  combined_score: number;
}> {
  const domain = extractDomain(senderEmail);

  const [domainResult, ipResult] = await Promise.all([
    domain ? getCachedDomainReport(domain) : Promise.resolve(null),
    senderIP ? getIPReport(senderIP) : Promise.resolve(null), // No caching for IPs
  ]);

  // Combine verdicts (worst-case)
  const verdicts: VTVerdict[] = [];
  if (domainResult) verdicts.push(domainResult.verdict);
  if (ipResult) verdicts.push(ipResult.verdict);

  const combinedVerdict = verdicts.length > 0 ? aggregateVerdicts(verdicts) : 'UNKNOWN';
  const combinedScore = verdictToScore(combinedVerdict);

  console.log(
    `[VirusTotal] Sender analysis complete - ` +
    `Domain: ${domainResult?.verdict || 'N/A'} (cached) | ` +
    `IP: ${ipResult?.verdict || 'N/A'} (live) | ` +
    `Combined: ${combinedVerdict} (${combinedScore})`
  );

  return {
    domain: domainResult,
    ip: ipResult,
    combined_verdict: combinedVerdict,
    combined_score: combinedScore,
  };
}
