import { execFile } from "child_process";
import path from "path";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Domains that are never real contact addresses (telemetry, placeholders, host SDKs).
const IGNORED_DOMAINS = ["example.com", "sentry", "wixpress"];

// The TLD pattern in EMAIL_REGEX (\.[a-zA-Z]{2,}) also matches asset extensions,
// so filenames like `bg-info@2x.png` or `logo@3x.svg` look like valid emails.
// Reject any match whose "domain" ends in a non-email asset extension...
const ASSET_EXT =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|tiff?|css|js|mjs|json|woff2?|ttf|eot|otf|mp4|webm|mp3|pdf|zip)$/i;
// ...or that uses a retina filename suffix (`@2x.`, `@3x.`).
const RETINA_SUFFIX = /@\d+x\./i;

/**
 * True if a string is a plausible contact address rather than a telemetry/
 * placeholder domain or an asset filename (e.g. `bg-info@2x.png`) that the loose
 * email regex captures as a false positive. Shared by `extractEmails` and the
 * Google Maps import path so both apply the exact same filter.
 */
export function isContactEmail(email: string): boolean {
  return (
    !IGNORED_DOMAINS.some((d) => email.includes(d)) &&
    !ASSET_EXT.test(email) &&
    !RETINA_SUFFIX.test(email)
  );
}

/**
 * Extract contact emails from raw page content, filtering out telemetry/placeholder
 * domains and asset filenames (e.g. retina images) that the loose email regex
 * would otherwise capture as false positives.
 */
export function extractEmails(content: string): string[] {
  return [...new Set(content.match(EMAIL_REGEX) || [])].filter(isContactEmail);
}

export interface ScrapeResult {
  success: boolean;
  url: string;
  title?: string;
  description?: string;
  content?: string;
  emails?: string[];
  meta?: Record<string, string>;
  error?: string;
  statusCode?: number;
}

/**
 * Scrape a website using the Python Scrapling script.
 * Falls back to a simple fetch if Python is not available.
 */
export async function scrapeWebsite(url: string): Promise<ScrapeResult> {
  // Ensure URL has protocol
  let fullUrl = url.trim();
  if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) {
    fullUrl = "https://" + fullUrl;
  }

  // Real SSL check: does the host actually serve HTTPS with a valid certificate?
  // Google Maps frequently lists http:// even when the site has a valid cert, so
  // deciding SSL from the URL scheme alone produced false "not secure" findings.
  const sslValid = await hasValidHttps(fullUrl);
  if (sslValid) fullUrl = fullUrl.replace(/^http:\/\//i, "https://");

  let result: ScrapeResult;
  try {
    result = await scrapWithPython(fullUrl);
    if (!result.success) {
      // Python scraper returned an error, try fetch fallback
      result = await scrapeWithFetch(fullUrl);
    }
  } catch {
    // Python not available or crashed, fallback to fetch
    result = await scrapeWithFetch(fullUrl);
  }

  // Authoritative SSL flag — overrides the scrapers' URL-scheme guess.
  if (result.success) {
    result.meta = { ...(result.meta || {}), ssl: sslValid ? "true" : "false" };
  }
  return result;
}

/**
 * True only if the host responds over HTTPS with a valid TLS certificate.
 * Node's fetch rejects on certificate validation failure, so a resolved
 * response (any status) means the handshake and cert check passed.
 */
async function hasValidHttps(rawUrl: string): Promise<boolean> {
  try {
    const httpsUrl = rawUrl.replace(/^http:\/\//i, "https://");
    if (!httpsUrl.startsWith("https://")) return false;
    const res = await fetch(httpsUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

function scrapWithPython(url: string): Promise<ScrapeResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "scripts", "scraper.py");
    const pythonCmd = process.env.PYTHON_PATH || "python3";

    execFile(
      pythonCmd,
      [scriptPath, url],
      { timeout: 30000, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch {
          reject(new Error("Failed to parse scraper output"));
        }
      }
    );
  });
}

async function scrapeWithFetch(url: string): Promise<ScrapeResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    const html = await response.text();
    const content = html.substring(0, 50000);

    // Extract title
    const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    // Extract meta description
    const descMatch = content.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i
    );
    const description = descMatch ? descMatch[1].trim() : undefined;

    // Extract emails from content
    const emails = extractEmails(content);

    // Extract text content (strip tags)
    const textContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 5000);

    // Detect meta info
    const meta: Record<string, string> = {};
    if (title) meta.title = title;
    if (description) meta.description = description;
    meta.statusCode = String(response.status);
    meta.contentType = response.headers.get("content-type") || "";
    meta.ssl = url.startsWith("https") ? "true" : "false";

    // Check viewport (mobile)
    const viewportMatch = content.match(/<meta[^>]*name=["']viewport["']/i);
    meta.hasViewport = viewportMatch ? "true" : "false";

    return {
      success: true,
      url,
      title,
      description,
      content: textContent,
      emails,
      meta,
      statusCode: response.status,
    };
  } catch (err) {
    return {
      success: false,
      url,
      error: err instanceof Error ? err.message : "Fetch failed",
    };
  }
}
