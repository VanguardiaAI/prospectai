import { describe, it, expect } from "vitest";
import { extractEmails } from "@/lib/scraper";

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
