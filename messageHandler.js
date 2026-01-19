const fs = require('fs');
const path = require('path');
const config = require('./config');
const dbManager = require('./database');
const logger = require('./utils/logger');

class MessageHandler {
  constructor(client) {
    this.client = client;
    this.ensureMediaDirectory();
  }

  ensureMediaDirectory() {
    if (!fs.existsSync(config.scraper.mediaPath)) {
      fs.mkdirSync(config.scraper.mediaPath, { recursive: true });
      logger.info(`Created media directory: ${config.scraper.mediaPath}`);
    }
  }

  /**
   * Scrape messages from a specific group
   */
  async scrapeGroup(groupId) {
    let scrapeId;
    let messageCount = 0;

    try {
      logger.info(`Starting scrape for group: ${groupId}`);

      // Get the chat
      const chat = await this.client.getChatById(groupId);

      if (!chat.isGroup) {
        throw new Error(`Chat ${groupId} is not a group`);
      }

      // Build participant map (LID -> phone number)
      this.participantMap = {};
      if (chat.participants) {
        for (const participant of chat.participants) {
          // participant.id._serialized can be like "94772147755@c.us"
          // Store the phone number against their LID if they have one
          const participantId = participant.id._serialized;
          if (participantId.includes('@c.us')) {
            const phoneNumber = participantId.split('@')[0];
            // Try to find their LID by getting their contact
            try {
              const contact = await this.client.getContactById(participantId);
              if (contact && contact.id && contact.id._serialized) {
                // Map their LID to their phone number
                this.participantMap[contact.id._serialized] = phoneNumber;
              }
            } catch (err) {
              // If we can't get contact, just store by their c.us ID
              this.participantMap[participantId] = phoneNumber;
            }
          }
        }
      }

      logger.info(`Built participant map with ${Object.keys(this.participantMap).length} entries`);

      // Update group information in database FIRST
      await dbManager.insertGroup({
        id: chat.id._serialized,
        name: chat.name,
        participants_count: chat.participants ? chat.participants.length : 0,
      });

      // Now create scrape history after group exists
      scrapeId = await dbManager.startScrapeHistory(groupId);

      // Fetch messages
      const messages = await chat.fetchMessages({
        limit: config.scraper.messageLimit
      });

      logger.info(`Fetched ${messages.length} messages from ${chat.name}`);

      // Process each message
      for (const msg of messages) {
        try {
          await this.processMessage(msg, groupId);
          messageCount++;
        } catch (error) {
          logger.error(`Error processing message ${msg.id._serialized}:`, error);
        }
      }

      // Mark scrape as completed
      await dbManager.endScrapeHistory(scrapeId, messageCount, 'completed');

      logger.info(`Scrape completed for ${chat.name}. Processed ${messageCount} messages`);

      return {
        success: true,
        groupId,
        groupName: chat.name,
        messagesProcessed: messageCount,
      };

    } catch (error) {
      logger.error(`Error scraping group ${groupId}:`, error);
      await dbManager.endScrapeHistory(scrapeId, messageCount, 'failed', error.message);

      return {
        success: false,
        groupId,
        error: error.message,
      };
    }
  }

  /**
   * Scrape all monitored groups
   */
  async scrapeAllGroups() {
    const results = [];

    for (const groupId of config.whatsapp.monitoredGroups) {
      const result = await this.scrapeGroup(groupId);
      results.push(result);

      // Add a small delay between groups to avoid rate limiting
      await this.sleep(2000);
    }

    return results;
  }

  /**
   * Process and store a single message
   */
  async processMessage(msg, groupId) {
    // Get contact information
    const contact = await msg.getContact();

    // Format timestamp to Date object (convert Unix seconds to milliseconds)
    const timestampFormatted = new Date(msg.timestamp * 1000);

    // Extract phone number - try multiple sources
    let authorPhone = null;

    // FIRST: Try to get from participant map (most reliable for groups)
    if (msg.author && this.participantMap && this.participantMap[msg.author]) {
      authorPhone = '+' + this.participantMap[msg.author];
    }
    // SECOND: Try contact's number
    else if (contact && contact.number) {
      authorPhone = '+' + contact.number;
    }
    // THIRD: Try from contact id if it's in @c.us format
    else if (contact && contact.id && contact.id._serialized) {
      const contactId = contact.id._serialized;
      if (contactId.includes('@c.us')) {
        authorPhone = '+' + contactId.split('@')[0];
      }
      // Also check participant map with contact id
      else if (this.participantMap && this.participantMap[contactId]) {
        authorPhone = '+' + this.participantMap[contactId];
      }
    }
    // FOURTH: Check if author field itself is in @c.us format
    else if (msg.author && msg.author.includes('@c.us')) {
      authorPhone = '+' + msg.author.split('@')[0];
    }
    // LAST: Fallback to author field only if it looks like a valid phone number
    else if (msg.author) {
      const authorNum = msg.author.split('@')[0];
      if (/^\d{10,15}$/.test(authorNum)) {
        authorPhone = '+' + authorNum;
      }
    }

    const messageData = {
      id: msg.id._serialized,
      group_id: groupId,
      message_body: msg.body,
      message_type: msg.type,
      timestamp: msg.timestamp,
      timestamp_formatted: timestampFormatted,
      from_number: msg.from,
      from_name: contact.pushname || contact.name || msg.from,
      author: msg.author,
      author_phone: authorPhone,
      is_from_me: msg.fromMe,
      has_media: msg.hasMedia,
      media_path: null,
      ack: msg.ack,
    };

    // Handle media if enabled and present
    if (msg.hasMedia && config.scraper.scrapeMedia) {
      try {
        messageData.media_path = await this.downloadMedia(msg);
      } catch (error) {
        logger.error(`Failed to download media for message ${msg.id._serialized}:`, error);
      }
    }

    // Insert message into database (async)
    await dbManager.insertMessage(messageData);
  }

  /**
   * Download and save media from a message
   */
  async downloadMedia(msg) {
    try {
      const media = await msg.downloadMedia();

      if (!media) {
        return null;
      }

      const extension = media.mimetype.split('/')[1];
      const filename = `${msg.id._serialized}.${extension}`;
      const filepath = path.join(config.scraper.mediaPath, filename);

      // Save media file
      fs.writeFileSync(filepath, media.data, { encoding: 'base64' });

      logger.info(`Media saved: ${filename}`);

      return filepath;
    } catch (error) {
      logger.error('Error downloading media:', error);
      return null;
    }
  }

  /**
   * Get the last message timestamp from a group
   */
  async getLastMessageTimestamp(groupId) {
    const messages = await dbManager.getMessagesByGroup(groupId, 1);
    return messages.length > 0 ? messages[0].timestamp : 0;
  }

  /**
   * Clean up old messages based on retention policy
   */
  async cleanupOldMessages() {
    if (config.database.retentionDays > 0) {
      logger.info(`Cleaning up messages older than ${config.database.retentionDays} days`);
      const deletedCount = await dbManager.deleteOldMessages(config.database.retentionDays);
      logger.info(`Deleted ${deletedCount} old messages`);
      return deletedCount;
    }
    return 0;
  }

  /**
   * Utility function for delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = MessageHandler;
