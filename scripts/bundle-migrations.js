#!/usr/bin/env node
/**
 * Reads supabase/migrations/*.sql and bundles them into
 * netlify/functions/_migrations.json for the run-migrations function.
 *
 * Run: node scripts/bundle-migrations.js
 * Auto-runs via `npm run prebuild`.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "supabase", "migrations");
const OUTPUT = join(import.meta.dirname, "..", "netlify", "functions", "_migrations.json");

const files = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith(".sql"))
  .sort(); // lexicographic — filenames start with YYYYMMDD

const migrations = files.map(f => ({
  name: basename(f, ".sql"),
  sql: readFileSync(join(MIGRATIONS_DIR, f), "utf-8").replace(/\r\n/g, "\n"),
}));

writeFileSync(OUTPUT, JSON.stringify(migrations, null, 2));
console.log(`[bundle-migrations] ${migrations.length} migration(s) → _migrations.json`);
