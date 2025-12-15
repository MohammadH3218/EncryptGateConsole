/**
 * VirusTotal Result Caching Layer
 *
 * Caches VT scan results in DynamoDB to reduce API calls and costs
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import {
  getDomainReport,
  getFileReport,
  scanURL,
  type VTDomainResult,
  type VTFileResult,
  type VTURLResult
} from './virustotal';

const REGION = process.env.AWS_REGION || 'us-east-1';
const VT_DOMAIN_CACHE_TABLE = process.env.VT_DOMAIN_CACHE_TABLE || 'VirusTotal_DomainCache';
const VT_FILE_CACHE_TABLE = process.env.VT_FILE_CACHE_TABLE || 'VirusTotal_FileCache';
const VT_URL_CACHE_TABLE = process.env.VT_URL_CACHE_TABLE || 'VirusTotal_URLCache';

const ddb = new DynamoDBClient({ region: REGION });

// Cache TTLs
const DOMAIN_CACHE_TTL = 7 * 24 * 60 * 60; // 7 days
const FILE_CACHE_TTL = 30 * 24 * 60 * 60; // 30 days (file hashes don't change)
const URL_CACHE_TTL = 3 * 24 * 60 * 60; // 3 days (URLs can change, but scan results are relatively stable)

// NOTE: IP caching removed - IPs change frequently for legitimate users
// (traveling, different networks, VPNs, mobile). Caching could cause false positives.

/**
 * Get cached domain report or fetch from VirusTotal
 */
export async function getCachedDomainReport(domain: string): Promise<VTDomainResult> {
  try {
    // Try to get from cache
    const cacheResult = await ddb.send(new GetItemCommand({
      TableName: VT_DOMAIN_CACHE_TABLE,
      Key: {
        domain: { S: domain }
      }
    }));

    if (cacheResult.Item) {
      const expiresAt = parseInt(cacheResult.Item.expiresAt?.N || '0');
      const now = Math.floor(Date.now() / 1000);

      // Check if cache is still valid
      if (expiresAt > now) {
        console.log(`[VT Cache] Domain cache HIT: ${domain}`);

        return {
          verdict: cacheResult.Item.verdict?.S as any,
          stats: JSON.parse(cacheResult.Item.stats?.S || '{}'),
          permalink: cacheResult.Item.permalink?.S || '',
          domain: domain,
          reputation: parseInt(cacheResult.Item.reputation?.N || '0'),
          categories: JSON.parse(cacheResult.Item.categories?.S || '{}'),
          last_analysis_date: cacheResult.Item.scannedAt?.S,
        };
      } else {
        console.log(`[VT Cache] Domain cache EXPIRED: ${domain}`);
      }
    } else {
      console.log(`[VT Cache] Domain cache MISS: ${domain}`);
    }

    // Cache miss or expired - fetch from VirusTotal
    const result = await getDomainReport(domain);

    // Store in cache (async, don't wait)
    storeDomainInCache(domain, result).catch(err =>
      console.error('[VT Cache] Error storing domain in cache:', err)
    );

    return result;

  } catch (error) {
    console.error('[VT Cache] Error getting cached domain:', error);
    // Fallback to direct VT call
    return getDomainReport(domain);
  }
}

/**
 * Store domain report in cache
 */
async function storeDomainInCache(domain: string, result: VTDomainResult): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + DOMAIN_CACHE_TTL;

  await ddb.send(new PutItemCommand({
    TableName: VT_DOMAIN_CACHE_TABLE,
    Item: {
      domain: { S: domain },
      verdict: { S: result.verdict },
      stats: { S: JSON.stringify(result.stats) },
      permalink: { S: result.permalink },
      reputation: { N: result.reputation.toString() },
      categories: { S: JSON.stringify(result.categories) },
      scannedAt: { S: new Date().toISOString() },
      expiresAt: { N: expiresAt.toString() }
    }
  }));

  console.log(`[VT Cache] Stored domain in cache: ${domain} (expires in ${DOMAIN_CACHE_TTL}s)`);
}

// IP caching removed - see note above about why IPs shouldn't be cached

/**
 * Get cached file report or fetch from VirusTotal
 */
export async function getCachedFileReport(sha256: string): Promise<VTFileResult | null> {
  try {
    // Try to get from cache
    const cacheResult = await ddb.send(new GetItemCommand({
      TableName: VT_FILE_CACHE_TABLE,
      Key: {
        sha256: { S: sha256 }
      }
    }));

    if (cacheResult.Item) {
      const expiresAt = parseInt(cacheResult.Item.expiresAt?.N || '0');
      const now = Math.floor(Date.now() / 1000);

      if (expiresAt > now) {
        console.log(`[VT Cache] File cache HIT: ${sha256.substring(0, 16)}...`);

        return {
          verdict: cacheResult.Item.verdict?.S as any,
          stats: JSON.parse(cacheResult.Item.stats?.S || '{}'),
          permalink: cacheResult.Item.permalink?.S || '',
          sha256: sha256,
          scan_date: cacheResult.Item.scannedAt?.S,
        };
      } else {
        console.log(`[VT Cache] File cache EXPIRED: ${sha256.substring(0, 16)}...`);
      }
    } else {
      console.log(`[VT Cache] File cache MISS: ${sha256.substring(0, 16)}...`);
    }

    // Cache miss or expired
    const result = await getFileReport(sha256);

    // Store in cache if found (async)
    if (result) {
      storeFileInCache(sha256, result).catch(err =>
        console.error('[VT Cache] Error storing file in cache:', err)
      );
    }

    return result;

  } catch (error) {
    console.error('[VT Cache] Error getting cached file:', error);
    return getFileReport(sha256);
  }
}

/**
 * Store file report in cache
 */
async function storeFileInCache(sha256: string, result: VTFileResult): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + FILE_CACHE_TTL;

  await ddb.send(new PutItemCommand({
    TableName: VT_FILE_CACHE_TABLE,
    Item: {
      sha256: { S: sha256 },
      verdict: { S: result.verdict },
      stats: { S: JSON.stringify(result.stats) },
      permalink: { S: result.permalink },
      scannedAt: { S: new Date().toISOString() },
      expiresAt: { N: expiresAt.toString() }
    }
  }));

  console.log(`[VT Cache] Stored file in cache: ${sha256.substring(0, 16)}...`);
}

/**
 * Get cached URL scan result or fetch from VirusTotal
 */
export async function getCachedURLReport(url: string): Promise<VTURLResult> {
  try {
    // Create a normalized URL key (base64 encoded for DynamoDB key)
    const urlKey = Buffer.from(url).toString('base64').replace(/[+/=]/g, (m) => {
      return { '+': '-', '/': '_', '=': '' }[m] || m;
    });

    // Try to get from cache
    const cacheResult = await ddb.send(new GetItemCommand({
      TableName: VT_URL_CACHE_TABLE,
      Key: {
        urlKey: { S: urlKey }
      }
    }));

    if (cacheResult.Item) {
      const expiresAt = parseInt(cacheResult.Item.expiresAt?.N || '0');
      const now = Math.floor(Date.now() / 1000);

      // Check if cache is still valid
      if (expiresAt > now) {
        console.log(`[VT Cache] URL cache HIT: ${url.substring(0, 50)}...`);

        return {
          verdict: cacheResult.Item.verdict?.S as any,
          stats: JSON.parse(cacheResult.Item.stats?.S || '{}'),
          permalink: cacheResult.Item.permalink?.S || '',
          url: url,
          analysis_id: cacheResult.Item.analysisId?.S,
        };
      } else {
        console.log(`[VT Cache] URL cache EXPIRED: ${url.substring(0, 50)}...`);
      }
    } else {
      console.log(`[VT Cache] URL cache MISS: ${url.substring(0, 50)}...`);
    }

    // Cache miss or expired - fetch from VirusTotal
    const result = await scanURL(url);

    // Store in cache (async, don't wait)
    storeURLInCache(url, result).catch(err =>
      console.error('[VT Cache] Error storing URL in cache:', err)
    );

    return result;

  } catch (error) {
    console.error('[VT Cache] Error getting cached URL:', error);
    // Fallback to direct VT call
    return scanURL(url);
  }
}

/**
 * Store URL scan result in cache
 */
async function storeURLInCache(url: string, result: VTURLResult): Promise<void> {
  try {
    const urlKey = Buffer.from(url).toString('base64').replace(/[+/=]/g, (m) => {
      return { '+': '-', '/': '_', '=': '' }[m] || m;
    });

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + URL_CACHE_TTL;

    await ddb.send(new PutItemCommand({
      TableName: VT_URL_CACHE_TABLE,
      Item: {
        urlKey: { S: urlKey },
        url: { S: url },
        verdict: { S: result.verdict },
        stats: { S: JSON.stringify(result.stats) },
        permalink: { S: result.permalink },
        analysisId: { S: result.analysis_id || '' },
        scannedAt: { S: new Date().toISOString() },
        expiresAt: { N: expiresAt.toString() }
      }
    }));

    console.log(`[VT Cache] Stored URL in cache: ${url.substring(0, 50)}... (expires in ${URL_CACHE_TTL}s)`);
  } catch (error) {
    console.error('[VT Cache] Error storing URL in cache:', error);
  }
}

/**
 * Cache statistics for monitoring
 */
export async function getVTCacheStats(): Promise<{
  domains: { hits: number; misses: number };
  files: { hits: number; misses: number };
  urls: { hits: number; misses: number };
}> {
  // This would require additional tracking
  // Could be implemented with DynamoDB streams + Lambda
  // Or by incrementing counters in a separate stats table
  return {
    domains: { hits: 0, misses: 0 },
    files: { hits: 0, misses: 0 },
    urls: { hits: 0, misses: 0 }
  };
}
