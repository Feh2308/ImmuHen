module.exports = {
  apps: [
    {
      name: "immuhen-api",
      cwd: "/opt/immuhen/current/backend",
      script: "index.js",
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "700M",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
      },
      error_file: "/var/log/immuhen/api-error.log",
      out_file: "/var/log/immuhen/api-out.log",
      time: true,
    },
  ],
};
