/**
 * Optional PM2 process file for DirectAdmin/VPS hosts that allow PM2.
 * Prefer DirectAdmin Node.js Selector + app.js when available.
 */
module.exports = {
  apps: [
    {
      name: 'digital-research-manager',
      script: 'app.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        SERVE_FRONTEND: 'true',
        TRUST_PROXY: 'true',
      },
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
