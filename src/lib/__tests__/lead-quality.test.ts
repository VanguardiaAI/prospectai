import { describe, it, expect } from "vitest";
import {
  extractDomain,
  isRoleEmail,
  parseEmailsField,
  hasContactEmail,
  classifyPhone,
  classifyLead,
  sanitizeIssues,
  sanitizeSummary,
} from "@/lib/lead-quality";

describe("extractDomain", () => {
  it("strips protocol and www, lowercases", () => {
    expect(extractDomain("https://www.Clinica.MX/contacto")).toBe("clinica.mx");
    expect(extractDomain("clinica.mx")).toBe("clinica.mx");
  });
  it("returns null for empty/invalid", () => {
    expect(extractDomain(null)).toBeNull();
    expect(extractDomain("")).toBeNull();
    expect(extractDomain("not a url with spaces")).toBeNull();
  });
});

describe("isRoleEmail", () => {
  it("flags generic role inboxes", () => {
    for (const e of ["info@clinica.mx", "contacto@hospital.com", "pacientes@hosp.mx", "ventas2@x.com", "citas@dental.mx"]) {
      expect(isRoleEmail(e)).toBe(true);
    }
  });
  it("does not flag personal addresses", () => {
    for (const e of ["juan.perez@clinica.mx", "dra.gomez@dental.mx", "laboratoriocmjadq@gmail.com"]) {
      expect(isRoleEmail(e)).toBe(false);
    }
  });
});

describe("parseEmailsField / hasContactEmail", () => {
  it("parses JSON-array, comma lists and single values, dropping asset false positives", () => {
    expect(parseEmailsField('["a@x.com","b@y.com"]').sort()).toEqual(["a@x.com", "b@y.com"]);
    expect(parseEmailsField("a@x.com, b@y.com")).toEqual(["a@x.com", "b@y.com"]);
    expect(parseEmailsField("bg-info@2x.png")).toEqual([]);
    expect(parseEmailsField("[]")).toEqual([]);
    expect(parseEmailsField(null)).toEqual([]);
  });
  it("hasContactEmail reflects presence of a real address", () => {
    expect(hasContactEmail("contacto@clinica.mx")).toBe(true);
    expect(hasContactEmail("logo@2x.png")).toBe(false);
    expect(hasContactEmail("")).toBe(false);
  });
});

describe("classifyPhone", () => {
  it("treats Mexican numbers (fixed_or_mobile) as WhatsApp-likely", () => {
    const c = classifyPhone("+525512345678");
    expect(c.phoneType).toBe("fixed_or_mobile");
    expect(c.whatsappLikely).toBe(true);
  });
  it("distinguishes Spanish mobile from fixed", () => {
    expect(classifyPhone("+34611223344").phoneType).toBe("mobile");
    expect(classifyPhone("+34611223344").whatsappLikely).toBe(true);
    expect(classifyPhone("+34912345678").phoneType).toBe("fixed_line");
    expect(classifyPhone("+34912345678").whatsappLikely).toBe(false);
  });
  it("uses defaultCountry for bare numbers and handles empty", () => {
    expect(classifyPhone("5512345678", "MX").whatsappLikely).toBe(true);
    expect(classifyPhone("").whatsappLikely).toBe(false);
    expect(classifyPhone("").phoneType).toBe("unknown");
  });
});

describe("classifyLead", () => {
  it("always excludes government by domain or by name", () => {
    expect(classifyLead({ name: "Clínica X", website: "https://salud.gob.mx" }).tier).toBe("excluded");
    expect(classifyLead({ name: "Secretaría de Salud" }).tier).toBe("excluded");
    expect(classifyLead({ name: "Hospital General de México" }).tier).toBe("excluded");
    expect(classifyLead({ name: "IMSS Unidad 21" }).tier).toBe("excluded");
  });

  it("demotes large hospitals to hidden low even with an email", () => {
    const q = classifyLead({
      name: "Hospital Ángeles",
      emails: "pacientes@hospitalangeles.com",
      phone: "+525512345678",
    });
    expect(q.tier).toBe("low");
    expect(q.hiddenByDefault).toBe(true);
    expect(q.reasons.join(" ")).toMatch(/hospital|instituci/i);
  });

  it("marks a small clinic with a personal email as good", () => {
    const q = classifyLead({
      name: "Clínica Dental Sonrisa",
      category: "Dentista",
      emails: "dra.gomez@sonrisa.mx",
      phone: "+525512345678",
    });
    expect(q.tier).toBe("good");
    expect(q.hiddenByDefault).toBe(false);
  });

  it("keeps a small clinic with only a role email as visible low (not hidden, not dropped)", () => {
    const q = classifyLead({
      name: "Clínica Dental Sonrisa",
      category: "Dentista",
      emails: "info@sonrisa.mx",
      phone: "+525512345678",
    });
    expect(q.tier).toBe("low");
    expect(q.hiddenByDefault).toBe(false);
    expect(q.emailType).toBe("role");
  });

  it("hides leads with no reachable channel at all", () => {
    const q = classifyLead({ name: "Consultorio sin datos", emails: null, phone: "+34912345678" });
    expect(q.hiddenByDefault).toBe(true);
    expect(q.tier).toBe("low");
  });

  it("ranks a good lead above a low one", () => {
    const good = classifyLead({ name: "Clínica A", emails: "ana@a.mx", phone: "+525512345678" });
    const low = classifyLead({ name: "Clínica B", emails: "info@b.mx", phone: "+34912345678" });
    expect(good.reachabilityScore).toBeGreaterThan(low.reachabilityScore);
  });
});

describe("sanitizeIssues", () => {
  it("drops unverifiable 'site looks broken/incomplete' claims", () => {
    const input = [
      "La página web se ve cortada",
      "El sitio parece incompleto",
      "Falta una meta description",
      "No tiene encabezado H1",
      "La web está en construcción",
      "El sitio no carga bien",
    ];
    expect(sanitizeIssues(input)).toEqual(["Falta una meta description", "No tiene encabezado H1"]);
  });
  it("handles null/empty entries", () => {
    expect(sanitizeIssues(null)).toEqual([]);
    expect(sanitizeIssues(["", "  ", "SEO débil"])).toEqual(["SEO débil"]);
  });
  it("drops the broader 'site unusable' vocabulary too", () => {
    expect(sanitizeIssues(["El sitio es completamente inaccesible", "Falta H1"])).toEqual(["Falta H1"]);
  });
});

describe("sanitizeSummary", () => {
  it("drops sentences that claim the site is broken/unusable, keeps the rest", () => {
    expect(sanitizeSummary("El sitio se ve cortado. Tiene buena presencia en redes."))
      .toBe("Tiene buena presencia en redes.");
    expect(sanitizeSummary("Buen sitio, rápido y con SSL.")).toBe("Buen sitio, rápido y con SSL.");
    expect(sanitizeSummary(null)).toBe("");
  });
  it("fully clears the exact pre-fix hallucination (CSS / inaccesible / falla grave / intervención urgente)", () => {
    const lie = "El sitio web presenta un error crítico de CSS que lo hace completamente inaccesible y disfuncional. Esto representa una falla grave en su presencia digital. Se requiere una intervención urgente para restaurar la funcionalidad básica del sitio.";
    expect(sanitizeSummary(lie)).toBe("");
  });
});
