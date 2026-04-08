import { createTestDb } from "./setup";

// Singleton test database - created once, shared across all tests in a file.
// Each test file gets its own instance since vitest runs files in separate workers.
const instance = createTestDb();

export const testDb = instance.db;
export const testSqlite = instance.sqlite;
