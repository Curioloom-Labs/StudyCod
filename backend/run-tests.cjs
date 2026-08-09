const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function findTestFiles(directory) {
  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...findTestFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(entryPath);
    }
  }

  return files;
}

const distDirectory = path.join(__dirname, "dist");
const testFiles = findTestFiles(distDirectory).sort();

if (testFiles.length === 0) {
  console.error(`No compiled test files found under ${distDirectory}`);
  process.exit(1);
}

// The CI workflow historically appends Jest's --runInBand flag. Node's test
// runner does not need it, so this wrapper intentionally discovers files and
// invokes Node directly without relying on shell-specific glob expansion.
const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
