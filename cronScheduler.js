const cron = require('node-cron');
const config = require('./config');
const logger = require('./utils/logger');

class CronScheduler {
  constructor(messageHandler) {
    this.messageHandler = messageHandler;
    this.jobs = {};
  }

  /**
   * Start the message scraping cron job
   */
  startMessageScraper() {
    const schedule = config.cron.schedules.scrapeMessages;

    logger.info(`Setting up message scraper cron job: ${schedule}`);

    this.jobs.scrapeMessages = cron.schedule(
      schedule,
      async () => {
        logger.info('Cron job triggered: Starting message scrape');

        try {
          const results = await this.messageHandler.scrapeAllGroups();

          // Log results
          const summary = results.map(r =>
            r.success
              ? `${r.groupName}: ${r.messagesProcessed} messages`
              : `${r.groupId}: FAILED - ${r.error}`
          ).join(', ');

          logger.info(`Scrape completed: ${summary}`);
        } catch (error) {
          logger.error('Cron job failed:', error);
        }
      },
      {
        scheduled: true,
        timezone: config.cron.timezone,
      }
    );

    logger.info('Message scraper cron job started');
  }

  /**
   * Start the cleanup cron job for old messages
   */
  startCleanupJob() {
    if (config.database.retentionDays === 0) {
      logger.info('Message retention is set to forever, skipping cleanup job');
      return;
    }

    const schedule = config.cron.schedules.cleanOldMessages;

    logger.info(`Setting up cleanup cron job: ${schedule}`);

    this.jobs.cleanup = cron.schedule(
      schedule,
      async () => {
        logger.info('Cron job triggered: Cleaning old messages');

        try {
          const deletedCount = this.messageHandler.cleanupOldMessages();
          logger.info(`Cleanup completed: ${deletedCount} messages deleted`);
        } catch (error) {
          logger.error('Cleanup job failed:', error);
        }
      },
      {
        scheduled: true,
        timezone: config.cron.timezone,
      }
    );

    logger.info('Cleanup cron job started');
  }

  /**
   * Start all scheduled jobs
   */
  startAll() {
    this.startMessageScraper();
    this.startCleanupJob();
    logger.info('All cron jobs started successfully');
  }

  /**
   * Stop all scheduled jobs
   */
  stopAll() {
    Object.values(this.jobs).forEach(job => {
      if (job) {
        job.stop();
      }
    });
    logger.info('All cron jobs stopped');
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    return {
      scrapeMessages: {
        schedule: config.cron.schedules.scrapeMessages,
        running: this.jobs.scrapeMessages ? true : false,
      },
      cleanup: {
        schedule: config.cron.schedules.cleanOldMessages,
        running: this.jobs.cleanup ? true : false,
        enabled: config.database.retentionDays > 0,
      },
      timezone: config.cron.timezone,
    };
  }
}

module.exports = CronScheduler;
