const nodeInterpreter = process.env.STUDYCOD_NODE_BIN || "/opt/nodejs/current/bin/node";

module.exports = {
  apps: [
    {
      name: "studycod-backend",
      cwd: "/var/www/studycod/backend",
      script: "/var/www/studycod/backend/dist/backend/src/index.js",
      instances: 1,
      exec_mode: "cluster",
      interpreter: nodeInterpreter,
      uid: "studycod",
      gid: "studycod",
      env: { NODE_ENV: "production" },
      kill_timeout: 10000,
      listen_timeout: 30000,
    },
    {
      name: "studycod-lsp",
      cwd: "/var/www/studycod/lsp-service",
      script: "/var/www/studycod/lsp-service/dist/index.js",
      instances: 1,
      exec_mode: "fork",
      interpreter: nodeInterpreter,
      uid: "studycod",
      gid: "studycod",
      env: { NODE_ENV: "production" },
      kill_timeout: 10000,
    },
  ],
};
