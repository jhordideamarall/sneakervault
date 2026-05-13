import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
loadEnvFile(path.join(repoRoot, ".env.local"));
loadEnvFile(path.join(repoRoot, "apps/web/.env.local"));

const projectRef = process.env.SUPABASE_PROJECT_REF || "jogqvffdjtjqdnflvubi";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error("Missing SUPABASE_ACCESS_TOKEN");

const sqlFile = process.argv[2];
if (!sqlFile) throw new Error("Usage: node scripts/run-supabase-sql.mjs <file.sql>");

const query = fs.readFileSync(path.resolve(sqlFile), "utf8");
const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query }),
});

const text = await response.text();
if (!response.ok) {
  console.error(text);
  process.exit(1);
}

console.log(text);
