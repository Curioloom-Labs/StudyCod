const { spawnSync } = require("child_process");
const path = require("path");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

run("npm", ["--prefix", path.join("..", "judge"), "run", "build"]);

run("npm", ["run", "build"], {
  cwd: __dirname
});

const env = {
  ...process.env,
  RUN_JUDGE_CONTRACT_TEST: "1"
};

run(
  "node",
  ["--test", path.join("dist", "backend", "src", "services", "judgeWorker", "judgeWorker.contract.test.js")],
  { cwd: __dirname, env }
);
