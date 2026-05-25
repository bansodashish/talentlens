module.exports = {
  apps: [
    {
      name: 'talentlens',
      script: './server/index.js',
      cwd: '/var/www/talentlens',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5001,
      },
    },
  ],
};
