const dbManager = require('./database');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./utils/logger');

/**
 * Export messages from database to JSON file
 * Usage: node export_to_json.js [groupId] [outputFile]
 */

async function exportMessagesToJSON(groupId = null, outputFile = null) {
    try {
        // Default output file name
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const defaultFileName = groupId
            ? `messages_${groupId.split('@')[0]}_${timestamp}.json`
            : `all_messages_${timestamp}.json`;

        const outputPath = outputFile || path.join(__dirname, 'exports', defaultFileName);

        // Ensure exports directory exists
        const exportDir = path.dirname(outputPath);
        await fs.mkdir(exportDir, { recursive: true });

        logger.info(`Starting export to: ${outputPath}`);

        // Build query based on whether groupId is provided
        let query, params;
        if (groupId) {
            query = `
                SELECT
                    m.id,
                    m.group_id,
                    g.name as group_name,
                    m.message_body,
                    m.message_type,
                    m.author,
                    m.author_phone,
                    m.from_number,
                    m.from_name,
                    m.timestamp,
                    m.timestamp_formatted,
                    m.is_from_me,
                    m.has_media,
                    m.media_path,
                    m.ack,
                    m.scraped_at
                FROM messages m
                LEFT JOIN groups g ON m.group_id = g.id
                WHERE m.group_id = $1
                ORDER BY m.timestamp ASC
            `;
            params = [groupId];
        } else {
            query = `
                SELECT
                    m.id,
                    m.group_id,
                    g.name as group_name,
                    m.message_body,
                    m.message_type,
                    m.author,
                    m.author_phone,
                    m.from_number,
                    m.from_name,
                    m.timestamp,
                    m.timestamp_formatted,
                    m.is_from_me,
                    m.has_media,
                    m.media_path,
                    m.ack,
                    m.scraped_at
                FROM messages m
                LEFT JOIN groups g ON m.group_id = g.id
                ORDER BY m.group_id, m.timestamp ASC
            `;
            params = [];
        }

        // Execute query using pool
        const result = await dbManager.pool.query(query, params);

        if (result.rows.length === 0) {
            logger.warn('No messages found to export');
            return {
                success: true,
                message: 'No messages found',
                count: 0,
                file: null
            };
        }

        // Prepare export data with metadata
        const exportData = {
            metadata: {
                exportDate: new Date().toISOString(),
                totalMessages: result.rows.length,
                groupId: groupId || 'all',
                databaseColumns: [
                    'id', 'group_id', 'group_name', 'message_body', 'message_type',
                    'author', 'author_phone', 'from_number', 'from_name', 'timestamp',
                    'timestamp_formatted', 'is_from_me', 'has_media', 'media_path',
                    'ack', 'scraped_at'
                ]
            },
            messages: result.rows.map(row => ({
                id: row.id,
                group_id: row.group_id,
                group_name: row.group_name,
                message_body: row.message_body,
                message_type: row.message_type,
                author: row.author,
                author_phone: row.author_phone,
                from_number: row.from_number,
                from_name: row.from_name,
                timestamp: row.timestamp,
                timestamp_formatted: row.timestamp_formatted,
                is_from_me: row.is_from_me,
                has_media: row.has_media,
                media_path: row.media_path,
                ack: row.ack,
                scraped_at: row.scraped_at
            }))
        };

        // Write to file
        await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2), 'utf8');

        logger.info(`Successfully exported ${result.rows.length} messages to ${outputPath}`);

        return {
            success: true,
            message: 'Export completed successfully',
            count: result.rows.length,
            file: outputPath
        };

    } catch (error) {
        logger.error('Error exporting messages to JSON:', error);
        throw error;
    }
}

// Get group statistics
async function getGroupStats(groupId) {
    try {
        const query = `
            SELECT
                g.name as group_name,
                COUNT(m.id) as total_messages,
                COUNT(DISTINCT m.author_phone) as unique_senders,
                MIN(m.timestamp) as first_message_date,
                MAX(m.timestamp) as last_message_date,
                COUNT(CASE WHEN m.has_media THEN 1 END) as media_messages
            FROM groups g
            LEFT JOIN messages m ON g.id = m.group_id
            WHERE g.id = $1
            GROUP BY g.name
        `;

        const result = await dbManager.pool.query(query, [groupId]);
        return result.rows[0] || null;
    } catch (error) {
        logger.error('Error getting group stats:', error);
        return null;
    }
}

// CLI execution
async function main() {
    const args = process.argv.slice(2);
    const groupId = args[0] || null;
    const outputFile = args[1] || null;

    console.log('\n=== WhatsApp Messages JSON Exporter ===\n');

    // Initialize database connection if not already initialized
    if (!dbManager.pool) {
        console.log('Initializing database connection...\n');
        dbManager.initialize();
        // Wait a moment for connection to be established
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (groupId) {
        console.log(`Group ID: ${groupId}`);
        const stats = await getGroupStats(groupId);
        if (stats) {
            console.log(`Group Name: ${stats.group_name}`);
            console.log(`Total Messages: ${stats.total_messages}`);
            console.log(`Unique Senders: ${stats.unique_senders}`);
            console.log(`Media Messages: ${stats.media_messages}`);
        }
    } else {
        console.log('Exporting all messages from all groups');
    }

    console.log('\nStarting export...\n');

    const result = await exportMessagesToJSON(groupId, outputFile);

    if (result.success) {
        console.log(`✓ ${result.message}`);
        console.log(`✓ Exported ${result.count} messages`);
        if (result.file) {
            console.log(`✓ File saved to: ${result.file}`);
        }
    } else {
        console.log(`✗ Export failed`);
    }

    // Close database connection
    await dbManager.close();

    process.exit(0);
}

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { exportMessagesToJSON, getGroupStats };
