const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");

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

const distDirectory = path.resolve(process.env.STUDYCOD_TEST_DIST_DIR || path.join(__dirname, "dist"));
const testFiles = findTestFiles(distDirectory).sort();

if (testFiles.length === 0) {
  console.error(`No compiled test files found under ${distDirectory}`);
  process.exit(1);
}

// Keep file-level concurrency bounded because curriculum contracts compile
// examples with external toolchains. Allow an isolated emit for local runs so
// verification does not need to replace the developer's backend/dist.
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=4", ...testFiles], {
  // Each test run gets its own signing key before application config is loaded.
  // Never depend on a developer's .env or pass a production signing key to tests.
  env: {
    ...process.env,
    NODE_ENV: "test",
    JWT_SECRET: randomBytes(32).toString("hex"),
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
