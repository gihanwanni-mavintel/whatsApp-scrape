const { Pool } = require('pg');
const config = require('./config');
const logger = require('./utils/logger');

class DatabaseManager {
  constructor() {
    this.pool = null;
  }

  initialize() {
    try {
      if (!config.database.url) {
        throw new Error('DATABASE_URL is required. Please set it in your .env file.');
      }

      // Create PostgreSQL connection pool
      this.pool = new Pool({
        connectionString: config.database.url,
        max: config.database.poolSize,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: config.database.url.includes('neon.tech') ? { rejectUnauthorized: false } : false,
      });

      // Test connection
      this.pool.query('SELECT NOW()', (err, res) => {
        if (err) {
          logger.error('Database connection test failed:', err);
          throw err;
        }
        logger.info(`Database connected successfully at: ${res.rows[0].now}`);
      });

      // Create tables
      this.createTables();

      return this.pool;
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  async createTables() {
    const client = await this.pool.connect();

    try {
      // Groups table
      await client.query(`
        CREATE TABLE IF NOT EXISTS groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          participants_count INTEGER,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Messages table
      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL,
          message_body TEXT,
          message_type TEXT,
          timestamp BIGINT NOT NULL,
          timestamp_formatted TIMESTAMPTZ,
          from_number TEXT,
          from_name TEXT,
          author TEXT,
          author_phone TEXT,
          is_from_me BOOLEAN DEFAULT FALSE,
          has_media BOOLEAN DEFAULT FALSE,
          media_path TEXT,
          ack INTEGER,
          scraped_at TIMESTAMPTZ DEFAULT NOW(),
          FOREIGN KEY (group_id) REFERENCES groups(id)
        )
      `);

      // Scrape history table
      await client.query(`
        CREATE TABLE IF NOT EXISTS scrape_history (
          id SERIAL PRIMARY KEY,
          group_id TEXT NOT NULL,
          messages_scraped INTEGER DEFAULT 0,
          scrape_start TIMESTAMPTZ DEFAULT NOW(),
          scrape_end TIMESTAMPTZ,
          status TEXT DEFAULT 'in_progress',
          error_message TEXT,
          FOREIGN KEY (group_id) REFERENCES groups(id)
        )
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_scrape_history_group_id ON scrape_history(group_id);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_scrape_history_date ON scrape_history(scrape_start);
      `);

      logger.info('Database tables and indexes created successfully');
    } catch (error) {
      logger.error('Error creating tables:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Group operations
  async insertGroup(groupData) {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO groups (id, name, participants_count, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          participants_count = EXCLUDED.participants_count,
          updated_at = NOW()
        RETURNING *
      `;

      const result = await client.query(query, [
        groupData.id,
        groupData.name,
        groupData.participants_count
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error inserting group:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getGroup(groupId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM groups WHERE id = $1',
        [groupId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting group:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getAllGroups() {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM groups ORDER BY updated_at DESC'
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting all groups:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Message operations
  async insertMessage(messageData) {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO messages (
          id, group_id, message_body, message_type, timestamp, timestamp_formatted,
          from_number, from_name, author, author_phone, is_from_me, has_media,
          media_path, ack
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id) DO NOTHING
        RETURNING *
      `;

      const result = await client.query(query, [
        messageData.id,
        messageData.group_id,
        messageData.message_body,
        messageData.message_type,
        messageData.timestamp,
        messageData.timestamp_formatted,
        messageData.from_number,
        messageData.from_name,
        messageData.author,
        messageData.author_phone,
        messageData.is_from_me,
        messageData.has_media,
        messageData.media_path,
        messageData.ack
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error('Error inserting message:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getMessagesByGroup(groupId, limit = 100, offset = 0) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM messages
         WHERE group_id = $1
         ORDER BY timestamp DESC
         LIMIT $2 OFFSET $3`,
        [groupId, limit, offset]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting messages by group:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getMessagesByDateRange(groupId, startDate, endDate) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM messages
         WHERE group_id = $1 AND timestamp >= $2 AND timestamp <= $3
         ORDER BY timestamp DESC`,
        [groupId, startDate, endDate]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting messages by date range:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getMessageCount(groupId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT COUNT(*) as count FROM messages WHERE group_id = $1',
        [groupId]
      );
      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error('Error getting message count:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async searchMessages(groupId, searchTerm) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM messages
         WHERE group_id = $1 AND message_body ILIKE $2
         ORDER BY timestamp DESC
         LIMIT 100`,
        [groupId, `%${searchTerm}%`]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error searching messages:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Scrape history operations
  async startScrapeHistory(groupId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO scrape_history (group_id, status)
         VALUES ($1, 'in_progress')
         RETURNING id`,
        [groupId]
      );
      return result.rows[0].id;
    } catch (error) {
      logger.error('Error starting scrape history:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async endScrapeHistory(scrapeId, messageCount, status = 'completed', errorMessage = null) {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE scrape_history
         SET scrape_end = NOW(),
             messages_scraped = $1,
             status = $2,
             error_message = $3
         WHERE id = $4`,
        [messageCount, status, errorMessage, scrapeId]
      );
    } catch (error) {
      logger.error('Error ending scrape history:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getScrapeHistory(groupId, limit = 10) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM scrape_history
         WHERE group_id = $1
         ORDER BY scrape_start DESC
         LIMIT $2`,
        [groupId, limit]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting scrape history:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getLatestScrape(groupId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM scrape_history
         WHERE group_id = $1
         ORDER BY scrape_start DESC
         LIMIT 1`,
        [groupId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting latest scrape:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Cleanup operations
  async deleteOldMessages(days) {
    const client = await this.pool.connect();
    try {
      const cutoffTimestamp = Date.now() - (days * 24 * 60 * 60 * 1000);
      const result = await client.query(
        'DELETE FROM messages WHERE timestamp < $1',
        [cutoffTimestamp]
      );
      return result.rowCount;
    } catch (error) {
      logger.error('Error deleting old messages:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Statistics
  async getGroupStatistics(groupId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT
          COUNT(*) as total_messages,
          COUNT(*) FILTER (WHERE has_media = TRUE) as media_messages,
          MIN(timestamp) as first_message_timestamp,
          MAX(timestamp) as last_message_timestamp,
          COUNT(DISTINCT from_number) as unique_senders
         FROM messages
         WHERE group_id = $1`,
        [groupId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting group statistics:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      logger.info('Database connection pool closed');
    }
  }
}

// Export singleton instance
const dbManager = new DatabaseManager();
module.exports = dbManager;
