require('dotenv').config();

module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
  },

  // WhatsApp configuration
  whatsapp: {
    // Add your group IDs here (you can get these from the /api/groups endpoint)
    // Format: 'groupId@g.us' or just the chat ID from the API
    monitoredGroups: process.env.MONITORED_GROUPS
      ? process.env.MONITORED_GROUPS.split(',').map(id => id.trim())
      : [],

    // Session folder for WhatsApp authentication
    sessionPath: './.wwebjs_auth',
  },

  // Cron job configuration
  cron: {
    // Default: Every 5 minutes
    // Format: minute hour day month weekday
    // Examples:
    // '*/5 * * * *'    - Every 5 minutes
    // '0 * * * *'      - Every hour
    // '0 */2 * * *'    - Every 2 hours
    // '0 9,17 * * *'   - At 9 AM and 5 PM
    // '0 0 * * *'      - Every day at midnight
    schedules: {
      scrapeMessages: process.env.CRON_SCHEDULE || '*/5 * * * *',
      cleanOldMessages: '0 2 * * *', // Every day at 2 AM
    },

    // Timezone for cron jobs
    timezone: process.env.TIMEZONE || 'Asia/Colombo',
  },

  // Database configuration
  database: {
    url: process.env.DATABASE_URL || '',
    // Connection pool settings
    poolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
    maxOverflow: parseInt(process.env.DB_MAX_OVERFLOW) || 20,
    // Number of days to keep messages (0 = keep forever)
    retentionDays: parseInt(process.env.RETENTION_DAYS) || 30,
  },

  // Scraper configuration
  scraper: {
    // Number of messages to fetch per scrape
    messageLimit: parseInt(process.env.MESSAGE_LIMIT) || 100,

    // Whether to scrape media files
    scrapeMedia: process.env.SCRAPE_MEDIA === 'true',

    // Media storage path
    mediaPath: './data/media',
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    logPath: './logs',
  },
};
