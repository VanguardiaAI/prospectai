import { execFile } from "child_process";
import path from "path";

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
  let fullUrl = url;
  if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) {
    fullUrl = "https://" + fullUrl;
  }

  try {
    const result = await scrapWithPython(fullUrl);
    if (result.success) return result;
    // Python scraper returned an error, try fetch fallback
    return await scrapeWithFetch(fullUrl);
  } catch {
    // Python not available or crashed, fallback to fetch
    return await scrapeWithFetch(fullUrl);
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
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = [...new Set(content.match(emailRegex) || [])].filter(
      (e) => !e.includes("example.com") && !e.includes("sentry") && !e.includes("wixpress")
    );

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
