#!/usr/bin/env node
// Verify better-sqlite3's native binary matches the running Node version.
// If it doesn't, rebuild it. Common cause: npm install ran with one Node
// version and the dev/start script runs with another.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function color(code, str) {
  return process.stdout.isTTY ? `\x1b[${code}m${str}\x1b[0m` : str;
}

function rebuild() {
  console.log(color(33, `[ensure-native] Rebuilding better-sqlite3 against Node ${process.version}...`));
  try {
    execFileSync("npm", ["rebuild", "better-sqlite3", "--silent"], { stdio: "inherit" });
    console.log(color(32, "[ensure-native] ok"));
  } catch (err) {
    console.error(color(31, `[ensure-native] rebuild failed: ${err.message}`));
    process.exit(1);
  }
}

try {
  // Loading the native binding will throw if the ABI doesn't match.
  require("better-sqlite3");
} catch (err) {
  if (String(err?.message || "").includes("NODE_MODULE_VERSION")) {
    rebuild();
  } else {
    console.error(color(31, `[ensure-native] unexpected error loading better-sqlite3: ${err.message}`));
    process.exit(1);
  }
}
