// PM2 process config. Change PORT if 3100 is taken on your server.
module.exports = {
  apps: [
    {
      name: "order-system-web",
      script: "npm",
      args: "start",
      cwd: __dirname,
      env: { NODE_ENV: "production", PORT: 3100 },
      max_restarts: 10,
    },
  ],
};
