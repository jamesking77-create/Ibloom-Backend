module.exports = {
  apps: [
    {
      name: "IBLOOM",
      script: "./index.js",
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "8G",
      watch: false,
      merge_logs: true,
      error_file: "./api.log",
      out_file: "./api.log",
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=8192",
      },
    },
  ],
};
