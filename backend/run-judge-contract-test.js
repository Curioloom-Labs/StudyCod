const { spawnSync } = require("child_process");
const path = require("path");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: false,
    ...opts
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

if (process.platform === "win32") {
  // .cmd shims cannot be spawned with shell:false on Windows. Keep this command
  // fixed and local so shell:true does not interpolate user-controlled input.
  run(`npm.cmd --prefix "${path.join("..", "judge")}" run build`, [], { shell: true });
} else {
  run("npm", ["--prefix", path.join("..", "judge"), "run", "build"]);
}

if (process.platform === "win32") {
  run("npm.cmd run build", [], { cwd: __dirname, shell: true });
} else {
  run("npm", ["run", "build"], { cwd: __dirname });
}

const env = {
  ...process.env,
  RUN_JUDGE_CONTRACT_TEST: "1"
};

run(
  "node",
  ["--test", path.join("dist", "backend", "src", "services", "judgeWorker", "judgeWorker.contract.test.js")],
  { cwd: __dirname, env }
);
