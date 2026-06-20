import { execFile } from "child_process";
import path from "path";
import { extractEmails, isContactEmail } from "@/lib/lead-quality";

// Re-exported for existing importers. The implementations live in lead-quality
// (a DB-free, browser-safe module) so the search UI can share the exact filter.
export { extractEmails, isContactEmail };

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
      .substring(0, 12000);

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
