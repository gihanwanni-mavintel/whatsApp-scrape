const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const puppeteer = require("puppeteer");
const express = require("express");
const moment = require("moment");

const config = require("./config");
const dbManager = require("./database");
const logger = require("./utils/logger");
const MessageHandler = require("./messageHandler");
const CronScheduler = require("./cronScheduler");
const { exportMessagesToJSON } = require("./export_to_json");

const app = express();
const PORT = config.server.port;

// Middleware
app.use(express.json());

// ==========================================
// Helper Functions
// ==========================================

/**
 * Extract phone number from WhatsApp author ID
 * @param {string} author - WhatsApp author ID (e.g., "162474452119805@lid" or "94772147755@c.us")
 * @returns {string} - Formatted phone number with country code (e.g., "+94772147755")
 */
function formatPhoneNumber(author) {
  if (!author) return null;

  // Extract the number part before @ symbol
  const numberPart = author.split('@')[0];

  // Add + prefix for international format
  return `+${numberPart}`;
}

// ==========================================
// WhatsApp Client Setup
// ==========================================
let clientReady = false;
let messageHandler;
let cronScheduler;
let latestQRCode = null; // Store QR code for web display

// Puppeteer configuration based on environment
const isProduction = process.env.NODE_ENV === 'production';

async function getPuppeteerConfig() {
  const baseConfig = {
    headless: isProduction ? true : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--single-process',
      '--disable-extensions'
    ],
  };

  if (isProduction) {
    // Use @sparticuz/chromium for cloud environments
    const chromium = require('@sparticuz/chromium');
    baseConfig.executablePath = await chromium.executablePath();
  } else if (process.platform === 'win32') {
    // Use local Chrome on Windows
    baseConfig.executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }

  return baseConfig;
}

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: config.whatsapp.sessionPath,
  }),
  puppeteer: getPuppeteerConfig,
});

// Client event handlers
client.on("ready", () => {
  logger.info("WhatsApp client is ready!");
  clientReady = true;

  // Initialize message handler
  messageHandler = new MessageHandler(client);

  // Initialize and start cron jobs
  cronScheduler = new CronScheduler(messageHandler);
  cronScheduler.startAll();

  logger.info("System fully initialized");
});

client.on("qr", async (qr) => {
  logger.info("QR code received - Scan with WhatsApp mobile app:");
  qrcodeTerminal.generate(qr, { small: true });
  console.log("\nOr scan this QR code in the terminal above ^\n");

  // Generate QR code as data URL for web display (useful for Render deployment)
  try {
    latestQRCode = await QRCode.toDataURL(qr);
    logger.info("QR code available at: GET /api/qr");
  } catch (error) {
    logger.error("Error generating QR code image:", error);
  }
});

client.on("authenticated", () => {
  logger.info("WhatsApp client authenticated successfully!");
});

client.on("auth_failure", (msg) => {
  logger.error("Authentication failure:", msg);
});

client.on("disconnected", (reason) => {
  logger.warn("WhatsApp client disconnected:", reason);
  clientReady = false;
});

// Initialize database and start client
dbManager.initialize();
client.initialize();

// ==========================================
// API Middleware
// ==========================================
const checkClientReady = (req, res, next) => {
  if (!clientReady) {
    return res.status(503).json({
      success: false,
      error: "WhatsApp client is not ready yet. Please scan the QR code first.",
    });
  }
  next();
};

// ==========================================
// API Endpoints
// ==========================================

// Health check
app.get("/api/health", (req, res) => {
  const cronStatus = cronScheduler ? cronScheduler.getStatus() : null;

  res.json({
    success: true,
    status: clientReady ? "ready" : "initializing",
    timestamp: new Date().toISOString(),
    database: "connected",
    cronJobs: cronStatus,
  });
});

// QR Code endpoint (for authentication on Render)
app.get("/api/qr", (_req, res) => {
  if (!latestQRCode) {
    return res.status(404).json({
      success: false,
      message: clientReady
        ? "Already authenticated. No QR code needed."
        : "QR code not yet generated. Please wait...",
    });
  }

  // Send HTML page with QR code image
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>WhatsApp Authentication</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            text-align: center;
            color: #333;
          }
          h1 { margin-top: 0; color: #667eea; }
          img {
            max-width: 400px;
            border: 2px solid #667eea;
            border-radius: 10px;
            padding: 20px;
            background: white;
          }
          .instructions {
            margin: 20px 0;
            text-align: left;
            max-width: 400px;
          }
          .instructions li { margin: 10px 0; }
          .refresh {
            margin-top: 20px;
            padding: 10px 20px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
          }
          .refresh:hover { background: #764ba2; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔐 WhatsApp Authentication</h1>
          <p>Scan this QR code with WhatsApp on your phone:</p>
          <img src="${latestQRCode}" alt="WhatsApp QR Code" />
          <div class="instructions">
            <h3>Instructions:</h3>
            <ol>
              <li>Open WhatsApp on your phone</li>
              <li>Go to <strong>Settings → Linked Devices</strong></li>
              <li>Tap <strong>Link a Device</strong></li>
              <li>Scan the QR code above</li>
            </ol>
          </div>
          <button class="refresh" onclick="location.reload()">Refresh QR Code</button>
        </div>
      </body>
    </html>
  `);
});

// Get all monitored groups
app.get("/api/groups", checkClientReady, async (req, res) => {
  try {
    const groups = await dbManager.getAllGroups();

    res.json({
      success: true,
      count: groups.length,
      groups: groups.map(g => ({
        ...g,
        isMonitored: config.whatsapp.monitoredGroups.includes(g.id),
      })),
    });
  } catch (error) {
    logger.error("Error fetching groups:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch groups",
      message: error.message,
    });
  }
});

// Get messages from a specific group
app.get("/api/groups/:groupId/messages", checkClientReady, async (req, res) => {
  try {
    const { groupId } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const messages = await dbManager.getMessagesByGroup(groupId, limit, offset);
    const group = await dbManager.getGroup(groupId);
    const total = await dbManager.getMessageCount(groupId);

    res.json({
      success: true,
      groupId,
      groupName: group ? group.name : null,
      count: messages.length,
      total: total,
      messages: messages.map(m => ({
        ...m,
        timestamp_readable: moment(parseInt(m.timestamp) * 1000).format('YYYY-MM-DD HH:mm:ss'),
        author_phone: formatPhoneNumber(m.author),
      })),
    });
  } catch (error) {
    logger.error("Error fetching messages:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch messages",
      message: error.message,
    });
  }
});

// Search messages
app.get("/api/search", checkClientReady, async (req, res) => {
  try {
    const { groupId, q } = req.query;

    if (!groupId || !q) {
      return res.status(400).json({
        success: false,
        error: "groupId and q (search term) are required",
      });
    }

    const messages = await dbManager.searchMessages(groupId, q);

    res.json({
      success: true,
      groupId,
      searchTerm: q,
      count: messages.length,
      messages: messages.map(m => ({
        ...m,
        timestamp_readable: moment(parseInt(m.timestamp) * 1000).format('YYYY-MM-DD HH:mm:ss'),
        author_phone: formatPhoneNumber(m.author),
      })),
    });
  } catch (error) {
    logger.error("Error searching messages:", error);
    res.status(500).json({
      success: false,
      error: "Failed to search messages",
      message: error.message,
    });
  }
});

// Get messages by date range
app.get("/api/groups/:groupId/messages/range", checkClientReady, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: "startDate and endDate are required (ISO format)",
      });
    }

    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    const messages = await dbManager.getMessagesByDateRange(groupId, start, end);

    res.json({
      success: true,
      groupId,
      dateRange: { startDate, endDate },
      count: messages.length,
      messages: messages.map(m => ({
        ...m,
        timestamp_readable: moment(parseInt(m.timestamp) * 1000).format('YYYY-MM-DD HH:mm:ss'),
        author_phone: formatPhoneNumber(m.author),
      })),
    });
  } catch (error) {
    logger.error("Error fetching messages by date range:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch messages by date range",
      message: error.message,
    });
  }
});

// Get group statistics
app.get("/api/groups/:groupId/stats", checkClientReady, async (req, res) => {
  try {
    const { groupId } = req.params;
    const stats = await dbManager.getGroupStatistics(groupId);
    const group = await dbManager.getGroup(groupId);

    res.json({
      success: true,
      groupId,
      groupName: group ? group.name : null,
      statistics: {
        ...stats,
        first_message_date: stats.first_message_timestamp
          ? moment(parseInt(stats.first_message_timestamp) * 1000).format('YYYY-MM-DD HH:mm:ss')
          : null,
        last_message_date: stats.last_message_timestamp
          ? moment(parseInt(stats.last_message_timestamp) * 1000).format('YYYY-MM-DD HH:mm:ss')
          : null,
      },
    });
  } catch (error) {
    logger.error("Error fetching group statistics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch group statistics",
      message: error.message,
    });
  }
});

// Get scrape history
app.get("/api/groups/:groupId/scrape-history", checkClientReady, async (req, res) => {
  try {
    const { groupId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const history = await dbManager.getScrapeHistory(groupId, limit);

    res.json({
      success: true,
      groupId,
      count: history.length,
      history,
    });
  } catch (error) {
    logger.error("Error fetching scrape history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch scrape history",
      message: error.message,
    });
  }
});

// Manual scrape trigger
app.post("/api/scrape/:groupId", checkClientReady, async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!messageHandler) {
      return res.status(503).json({
        success: false,
        error: "Message handler not initialized yet",
      });
    }

    // Run scrape in background
    messageHandler.scrapeGroup(groupId).then(result => {
      logger.info(`Manual scrape completed for ${groupId}:`, result);
    }).catch(error => {
      logger.error(`Manual scrape failed for ${groupId}:`, error);
    });

    res.json({
      success: true,
      message: "Scrape started in background",
      groupId,
    });
  } catch (error) {
    logger.error("Error triggering manual scrape:", error);
    res.status(500).json({
      success: false,
      error: "Failed to trigger scrape",
      message: error.message,
    });
  }
});

// Scrape all monitored groups manually
app.post("/api/scrape-all", checkClientReady, async (req, res) => {
  try {
    if (!messageHandler) {
      return res.status(503).json({
        success: false,
        error: "Message handler not initialized yet",
      });
    }

    // Run scrape in background
    messageHandler.scrapeAllGroups().then(results => {
      logger.info('Manual scrape all completed:', results);
    }).catch(error => {
      logger.error('Manual scrape all failed:', error);
    });

    res.json({
      success: true,
      message: "Scrape started for all monitored groups",
      groups: config.whatsapp.monitoredGroups,
    });
  } catch (error) {
    logger.error("Error triggering scrape all:", error);
    res.status(500).json({
      success: false,
      error: "Failed to trigger scrape all",
      message: error.message,
    });
  }
});

// List all available chats (for finding group IDs)
app.get("/api/chats", checkClientReady, async (req, res) => {
  try {
    const chats = await client.getChats();
    const chatList = chats.map((chat) => ({
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      timestamp: chat.timestamp,
      isMonitored: config.whatsapp.monitoredGroups.includes(chat.id._serialized),
    }));

    res.json({
      success: true,
      count: chatList.length,
      chats: chatList,
    });
  } catch (error) {
    logger.error("Error fetching chats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch chats",
      message: error.message,
    });
  }
});

// Cron job status
app.get("/api/cron/status", (req, res) => {
  if (!cronScheduler) {
    return res.status(503).json({
      success: false,
      error: "Cron scheduler not initialized yet",
    });
  }

  res.json({
    success: true,
    status: cronScheduler.getStatus(),
  });
});

// Export messages to JSON file
app.post("/api/export/:groupId", checkClientReady, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { outputFile } = req.body;

    logger.info(`Starting export for group: ${groupId}`);

    const result = await exportMessagesToJSON(groupId, outputFile);

    res.json(result);
  } catch (error) {
    logger.error("Error exporting messages:", error);
    res.status(500).json({
      success: false,
      error: "Failed to export messages",
      message: error.message,
    });
  }
});

// Export all messages to JSON file
app.post("/api/export-all", checkClientReady, async (req, res) => {
  try {
    const { outputFile } = req.body;

    logger.info("Starting export for all messages");

    const result = await exportMessagesToJSON(null, outputFile);

    res.json(result);
  } catch (error) {
    logger.error("Error exporting all messages:", error);
    res.status(500).json({
      success: false,
      error: "Failed to export all messages",
      message: error.message,
    });
  }
});

// ==========================================
// Server Startup
// ==========================================
app.listen(PORT, () => {
  logger.info(`Express API server running on http://localhost:${PORT}`);
  logger.info(`API Documentation:`);
  logger.info(`  GET  /api/health - Health check`);
  logger.info(`  GET  /api/qr - WhatsApp QR code for authentication`);
  logger.info(`  GET  /api/chats - List all WhatsApp chats`);
  logger.info(`  GET  /api/groups - List monitored groups`);
  logger.info(`  GET  /api/groups/:groupId/messages - Get messages from group`);
  logger.info(`  GET  /api/search?groupId=X&q=keyword - Search messages`);
  logger.info(`  GET  /api/groups/:groupId/stats - Get group statistics`);
  logger.info(`  GET  /api/groups/:groupId/scrape-history - Get scrape history`);
  logger.info(`  POST /api/scrape/:groupId - Manually trigger scrape`);
  logger.info(`  POST /api/scrape-all - Scrape all monitored groups`);
  logger.info(`  POST /api/export/:groupId - Export group messages to JSON`);
  logger.info(`  POST /api/export-all - Export all messages to JSON`);
  logger.info(`  GET  /api/cron/status - Get cron job status`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');

  if (cronScheduler) {
    cronScheduler.stopAll();
  }

  if (client) {
    client.destroy();
  }

  if (dbManager) {
    dbManager.close();
  }

  process.exit(0);
});
