module.exports = {
  apps: [
    {
      name: 'lifelong-dashboard-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      cwd: './',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '1G',
      watch: false
    }
  ]
};
