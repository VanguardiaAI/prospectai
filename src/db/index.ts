// Database module - re-exports connection, runs migrations, and initializes settings
export { db } from "./connection";
export { getSetting, setSetting, getApiKey } from "./settings";

import { runMigrations } from "./migrations";
import { initializeDefaultSettings } from "./settings";

// Run on module load (same behavior as before)
runMigrations();
initializeDefaultSettings();
