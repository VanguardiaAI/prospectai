import { describe, it, expect } from "vitest";
import { extractEmails, isContactEmail } from "@/lib/scraper";

describe("extractEmails", () => {
  it("rejects retina asset filenames that look like emails", () => {
    const content = `
      <img src="bg-info@2x.png">
      <img src="logo@3x.svg">
      <link href="sprite@2x.webp">
    `;
    expect(extractEmails(content)).toEqual([]);
  });

  it("rejects other asset filenames captured by the loose regex", () => {
    const content = "background: url(icons@1x.gif); font: url(font.woff2);";
    expect(extractEmails(content)).toEqual([]);
  });

  it("keeps valid contact emails", () => {
    const content = `
      Contact us at hola@clinica.mx or ventas@empresa.com.
      Soporte: soporte.tecnico@mi-negocio.io
    `;
    expect(extractEmails(content).sort()).toEqual(
      ["hola@clinica.mx", "soporte.tecnico@mi-negocio.io", "ventas@empresa.com"].sort()
    );
  });

  it("keeps valid emails while dropping asset false positives in the same content", () => {
    const content = `
      <img src="bg-info@2x.png">
      Escríbenos a contacto@hospital.com.mx
      <img src="logo@3x.svg">
    `;
    expect(extractEmails(content)).toEqual(["contacto@hospital.com.mx"]);
  });

  it("still filters telemetry and placeholder domains", () => {
    const content =
      "test@example.com abc123@o123.ingest.sentry.io user@wixpress.com real@negocio.com";
    expect(extractEmails(content)).toEqual(["real@negocio.com"]);
  });

  it("deduplicates repeated emails", () => {
    const content = "info@acme.com info@acme.com info@acme.com";
    expect(extractEmails(content)).toEqual(["info@acme.com"]);
  });
});

describe("isContactEmail", () => {
  it("rejects the asset filenames that poisoned imported leads", () => {
    // Exact values captured by the Google Maps scraper before the fix.
    expect(isContactEmail("bg-info@2x.png")).toBe(false);
    expect(isContactEmail("close_side_menu@2x.png")).toBe(false);
    expect(isContactEmail("logo-degradado-comprimido@0.25x.png")).toBe(false);
  });

  it("rejects telemetry and placeholder domains", () => {
    expect(isContactEmail("test@example.com")).toBe(false);
    expect(isContactEmail("user@wixpress.com")).toBe(false);
  });

  it("accepts real contact addresses", () => {
    expect(isContactEmail("contacto@dentistaqueretaro.com.mx")).toBe(true);
    expect(isContactEmail("laboratoriocmjadq@gmail.com")).toBe(true);
  });
});
