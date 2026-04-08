import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/login",
          "/overview",
          "/leads",
          "/campaigns",
          "/templates",
          "/search",
          "/pipeline",
          "/settings",
          "/calendar",
          "/ab-testing",
          "/today",
          "/review",
          "/activity",
          "/blacklist",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
