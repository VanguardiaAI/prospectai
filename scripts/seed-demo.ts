/**
 * Seed script: populates the DB with realistic demo data for dashboard screenshots.
 * Run: npx tsx scripts/seed-demo.ts
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "prospect-ai.db");
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Helper: random int in range
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)];

// Date helpers
const today = new Date();
const dayStr = (d: Date) => d.toISOString().split("T")[0];
const dateAgo = (days: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return d.toISOString().replace("T", " ").slice(0, 19);
};

console.log("Seeding demo data...");

// --- Campaign ---
sqlite.exec(`
  INSERT OR IGNORE INTO campaigns (id, name, description, daily_limit, quality_threshold, autopilot, default_tone, status)
  VALUES
    (1, 'Madrid Restaurantes', 'Prospección restaurantes Madrid centro', 50, 40, 1, 'profesional', 'active'),
    (2, 'Barcelona Hoteles', 'Hoteles boutique Barcelona', 30, 35, 1, 'amigable', 'active'),
    (3, 'Valencia Clínicas', 'Clínicas dentales Valencia', 25, 45, 0, 'profesional', 'active');
`);

// --- Settings ---
sqlite.exec(`
  INSERT OR REPLACE INTO settings (key, value) VALUES
    ('global_daily_limit', '50'),
    ('autopilot_global', 'true'),
    ('wa_daily_limit', '20');
`);

// --- Leads ---
const cities = ["Madrid", "Barcelona", "Valencia", "Sevilla", "Málaga", "Bilbao", "Zaragoza"];
const categories = ["Restaurante", "Hotel", "Clínica dental", "Tienda de ropa", "Peluquería", "Gimnasio", "Cafetería", "Bar"];
const statuses = ["imported", "analyzed", "email_generated", "email_approved", "email_sent", "wa_sent", "contacted", "replied", "rejected"];
const services = ["web_development", "seo", "ai_agents", "google_business", "social_media"];

const insertLead = sqlite.prepare(`
  INSERT INTO leads (campaign_id, name, category, phone, email, website, city, rating, review_count, web_quality_score, opportunity_score, analysis_json, status, imported_at, analyzed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const leadNames = [
  "La Tasca de Juan", "Hotel Boutique Sol", "Clínica Sonrisa", "Moda Express", "Peluquería Arte",
  "GymFit Pro", "Café del Centro", "Bar El Rincón", "Restaurante Olivo", "Hotel Terraza",
  "Clínica Vital", "Tienda Luna", "Salon Belleza", "CrossFit Box", "Pastelería Dulce",
  "Tapas Madrid", "Hostal Playa", "Dental Plus", "Boutique Estilo", "Barbería Classic",
  "Yoga Studio", "Pizzería Roma", "Hotel Marina", "Farmacia Central", "Floristería Rosa",
  "Restaurante Mar", "Pub Dublin", "Clínica Fisio", "Zapatería Paco", "Spa Relax",
  "Trattoria Bella", "Pensión Aurora", "Óptica Visión", "Librería Lorca", "Heladería Artesana",
  "Asador Grill", "Hostel Backpack", "Centro Podología", "Joyería Oro", "Estética Glow",
  "Sushi Tokyo", "Parador Real", "Veterinaria Fauna", "Mercería Hilos", "Pilates Core",
  "Cervecería Hops", "B&B Jardín", "Nutrición Plus", "Bazar Oriente", "Taller Cerámica",
];

for (let i = 0; i < 247; i++) {
  const city = pick(cities);
  const cat = pick(categories);
  const status = pick(statuses);
  const name = i < leadNames.length ? leadNames[i] : `${pick(categories)} ${city} ${i}`;
  const quality = rand(5, 95);
  const opportunity = rand(20, 95);
  const recommendedServices = [pick(services), pick(services)].filter((v, idx, a) => a.indexOf(v) === idx);
  const analysisJson = JSON.stringify({ recommendedServices, webSpeed: rand(20, 90), seoScore: rand(10, 80) });
  const daysAgo = rand(0, 14);

  insertLead.run(
    pick([1, 2, 3]),
    name,
    cat,
    `+34 ${rand(600, 699)} ${rand(100, 999)} ${rand(100, 999)}`,
    `info@${name.toLowerCase().replace(/[^a-z]/g, "")}.es`,
    `https://${name.toLowerCase().replace(/[^a-z]/g, "")}.es`,
    city,
    (rand(30, 50) / 10).toFixed(1),
    rand(5, 500),
    quality,
    opportunity,
    analysisJson,
    status,
    dateAgo(daysAgo),
    status !== "imported" ? dateAgo(Math.max(daysAgo - 1, 0)) : null
  );
}

console.log("  ✓ 247 leads inserted");

// Get actual lead IDs from the DB
const leadIds: number[] = sqlite.prepare("SELECT id FROM leads ORDER BY id").all().map((r: any) => r.id);

// --- Emails ---
const insertEmail = sqlite.prepare(`
  INSERT INTO emails (lead_id, campaign_id, to_email, subject, body_html, body_text, tone, status, sent_at, opened_at, clicked_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (let i = 0; i < 142; i++) {
  const leadId = pick(leadIds);
  const status = pick(["sent", "sent", "sent", "sent", "draft", "draft"]);
  const daysAgo = rand(0, 6);
  const sentAt = status === "sent" ? dateAgo(daysAgo) : null;
  const opened = status === "sent" && Math.random() < 0.42;
  const clicked = opened && Math.random() < 0.18;

  insertEmail.run(
    leadId,
    pick([1, 2, 3]),
    `info@negocio${leadId}.es`,
    `Mejora la presencia online de tu negocio`,
    `<p>Hola, hemos analizado tu web...</p>`,
    `Hola, hemos analizado tu web...`,
    "profesional",
    status,
    sentAt,
    opened ? dateAgo(Math.max(daysAgo - 1, 0)) : null,
    clicked ? dateAgo(Math.max(daysAgo - 1, 0)) : null
  );
}

console.log("  ✓ 142 emails inserted");

// --- WhatsApp Messages ---
const insertWa = sqlite.prepare(`
  INSERT INTO whatsapp_messages (lead_id, campaign_id, to_phone, body, tone, status, sent_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

for (let i = 0; i < 68; i++) {
  const leadId = pick(leadIds);
  const status = pick(["sent", "sent", "sent", "draft", "draft"]);
  const daysAgo = rand(0, 6);

  insertWa.run(
    leadId,
    pick([1, 2, 3]),
    `+34 ${rand(600, 699)} ${rand(100, 999)} ${rand(100, 999)}`,
    `Hola! Somos VanguardIA, hemos analizado tu web y encontramos oportunidades de mejora.`,
    "amigable",
    status,
    status === "sent" ? dateAgo(daysAgo) : null
  );
}

console.log("  ✓ 68 whatsapp messages inserted");

// --- Replies ---
const insertReply = sqlite.prepare(`
  INSERT INTO replies (lead_id, campaign_id, channel, from_address, body, received_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

for (let i = 0; i < 18; i++) {
  const leadId = pick(leadIds.slice(0, Math.min(100, leadIds.length)));
  const channel = pick(["email", "email", "whatsapp"]);
  insertReply.run(
    leadId,
    pick([1, 2, 3]),
    channel,
    channel === "email" ? `info@negocio${leadId}.es` : `+34 6${rand(10, 99)} ${rand(100, 999)} ${rand(100, 999)}`,
    pick(["Me interesa, envíame más info", "¿Cuánto cuesta?", "Llámame mañana", "Sí, necesitamos mejorar la web"]),
    dateAgo(rand(0, 5))
  );
}

console.log("  ✓ 18 replies inserted");

sqlite.close();
console.log("\nDone! Dashboard should now show live data.");
