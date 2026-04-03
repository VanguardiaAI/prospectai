#!/usr/bin/env node
// Utility to generate a bcrypt hash for AUTH_PASSWORD_HASH
// Usage: node scripts/hash-password.mjs <password>

import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const escaped = hash.replace(/\$/g, "\\$");
console.log(`\nAUTH_PASSWORD_HASH="${escaped}"`);
console.log("\nCopy the line above into your .env file.");
console.log("(The $ signs are escaped for dotenv compatibility.)\n");
