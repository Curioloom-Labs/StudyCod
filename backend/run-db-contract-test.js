const { spawnSync } = require("child_process");
const path = require("path");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

if (!process.env.DB_CONTRACT_DATABASE_URL) {
  console.error("DB_CONTRACT_DATABASE_URL is required for test:db-contract");
  process.exit(1);
}

run("npm", ["run", "build"], {
  cwd: __dirname,
});

const env = {
  ...process.env,
  RUN_DB_CONTRACT_TEST: "1",
};

run(
  "node",
  ["--test", path.join("dist", "backend", "src", "migrations", "db.contract.test.js")],
  {
    cwd: __dirname,
    env,
  }
);
