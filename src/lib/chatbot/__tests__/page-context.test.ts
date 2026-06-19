import { describe, it, expect } from "vitest";
import { describePage, PAGE_GUIDE } from "@/lib/chatbot/page-context";

describe("describePage", () => {
  it("describes a known top-level route", () => {
    const out = describePage("/review");
    expect(out).toContain("CURRENT PAGE");
    expect(out).toContain(PAGE_GUIDE["/review"].title);
    expect(out).toContain("(/review)");
  });

  it("resolves a nested route to its section (longest-prefix match)", () => {
    const out = describePage("/campaigns/123");
    expect(out).toContain(PAGE_GUIDE["/campaigns"].title);
    expect(out).toContain("(/campaigns/123)");
  });

  it("strips query string and trailing slash", () => {
    const a = describePage("/leads/?page=2");
    expect(a).toContain(PAGE_GUIDE["/leads"].title);
    const b = describePage("/inicio/");
    expect(b).toContain("(/inicio)");
  });

  it("returns null for unknown routes", () => {
    expect(describePage("/login")).toBeNull();
    expect(describePage("/")).toBeNull();
    expect(describePage(null)).toBeNull();
    expect(describePage(undefined)).toBeNull();
  });

  it("always names the tools that cover the page", () => {
    for (const key of Object.keys(PAGE_GUIDE)) {
      const out = describePage(key);
      expect(out).toContain("You can do this from chat with");
    }
  });
});
