const { spawnSync } = require("child_process");
const path = require("path");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: false,
    ...opts,
  });
  if (res.error) {
    console.error(`DB CONTRACT RUNNER FAILED to spawn ${cmd}: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

if (!process.env.DB_CONTRACT_DATABASE_URL) {
  const required = process.env.DB_CONTRACT_REQUIRED === "1";
  console.log(`DB CONTRACT ${required ? "REQUIRED" : "UNVERIFIED"}: set DB_CONTRACT_DATABASE_URL to run against an isolated test database`);
  process.exit(required ? 1 : 0);
}

if (process.platform === "win32") {
  // npm.cmd shims require cmd.exe on Windows. The command and arguments are
  // fixed, so invoke it explicitly and keep the child spawn shell-free.
  run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm.cmd run build"], { cwd: __dirname, shell: false });
} else {
  run("npm", ["run", "build"], { cwd: __dirname });
}

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
