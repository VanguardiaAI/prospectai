#!/usr/bin/env python3
"""
ProspectAI Web Scraper - Uses Scrapling library
Receives a URL as argument, outputs JSON to stdout.
"""
import sys
import json
import re

def scrape_url(url: str) -> dict:
    try:
        from scrapling import Fetcher

        fetcher = Fetcher(auto_match=False)
        response = fetcher.get(url, timeout=20)

        # Extract basic info
        title = ""
        description = ""
        title_el = response.css_first("title")
        if title_el:
            title = title_el.text(strip=True)

        desc_el = response.css_first('meta[name="description"]')
        if desc_el:
            description = desc_el.attrib.get("content", "")

        # Extract text content
        # Remove script and style tags
        for tag in response.css("script, style, noscript"):
            tag.remove()

        body = response.css_first("body")
        text_content = body.text(separator=" ", strip=True) if body else ""
        text_content = re.sub(r'\s+', ' ', text_content)[:12000]

        # Extract emails. The TLD pattern (\.[a-zA-Z]{2,}) also matches asset
        # extensions, so filenames like `bg-info@2x.png` look like valid emails.
        email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        asset_ext = re.compile(
            r'\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|tiff?|css|js|mjs|json|woff2?|ttf|eot|otf|mp4|webm|mp3|pdf|zip)$',
            re.IGNORECASE,
        )
        retina_suffix = re.compile(r'@\d+x\.', re.IGNORECASE)
        html_text = response.html or ""
        emails = list(set(re.findall(email_pattern, html_text)))
        emails = [
            e for e in emails
            if 'example.com' not in e and 'sentry' not in e and 'wixpress' not in e
            and not asset_ext.search(e) and not retina_suffix.search(e)
        ]

        # Meta info
        meta = {"title": title, "description": description}
        meta["statusCode"] = str(response.status)
        meta["ssl"] = "true" if url.startswith("https") else "false"

        viewport = response.css_first('meta[name="viewport"]')
        meta["hasViewport"] = "true" if viewport else "false"

        # Check for common CMS/builders
        generators = response.css('meta[name="generator"]')
        if generators:
            meta["generator"] = generators[0].attrib.get("content", "")

        return {
            "success": True,
            "url": url,
            "title": title,
            "description": description,
            "content": text_content,
            "emails": emails,
            "meta": meta,
            "statusCode": response.status
        }

    except ImportError:
        return {
            "success": False,
            "url": url,
            "error": "Scrapling not installed. Run: pip install scrapling"
        }
    except Exception as e:
        return {
            "success": False,
            "url": url,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No URL provided"}))
        sys.exit(1)

    result = scrape_url(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False))
