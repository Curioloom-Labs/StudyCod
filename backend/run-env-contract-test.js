const fs = require("node:fs");
const path = require("node:path");

const sourceRoot = path.join(__dirname, "src");
const envFile = path.join(sourceRoot, "env.ts");

function listTypeScriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listTypeScriptFiles(fullPath));
    else if (/\.ts$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

const schemaText = fs.readFileSync(envFile, "utf8");
const declared = new Set(
  [...schemaText.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):\s*z\./gm)].map(match => match[1]),
);
const used = new Map();

for (const file of listTypeScriptFiles(sourceRoot)) {
  if (file === envFile) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    const name = match[1];
    if (!used.has(name)) used.set(name, path.relative(__dirname, file));
  }
}

const missing = [...used.keys()].filter(name => !declared.has(name));
if (missing.length > 0) {
  console.error("ENV CONTRACT FAIL: undeclared variables:");
  for (const name of missing) console.error(`- ${name} (${used.get(name)})`);
  process.exit(1);
}

console.log(`ENV CONTRACT PASS: ${used.size} static process.env variables are declared in src/env.ts`);
