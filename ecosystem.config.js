module.exports = {
  apps: [{
    name: 'file-manager',
    script: 'npm',
    args: 'start',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '2G',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    merge_logs: true,
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    // Health monitoring
    min_uptime: '10s',
    max_restarts: 10,
    // Advanced features
    post_update: ['npm install'],
    // Environment specific settings
    instance_var: 'INSTANCE_ID',
    // Logging configuration
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};