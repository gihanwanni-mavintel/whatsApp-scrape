require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function clearDatabase() {
  const client = await pool.connect();

  try {
    console.log('\n=================================');
    console.log('Clearing all database data...');
    console.log('=================================\n');

    // Start transaction
    await client.query('BEGIN');

    // Temporarily disable foreign key checks
    console.log('Disabling foreign key constraints...');
    await client.query('SET CONSTRAINTS ALL DEFERRED');

    // Delete in correct order due to foreign key constraints
    console.log('1. Deleting messages...');
    const messagesResult = await client.query('DELETE FROM messages');
    console.log(`   ✓ Deleted ${messagesResult.rowCount} messages`);

    console.log('2. Deleting scrape history...');
    const scrapeResult = await client.query('DELETE FROM scrape_history');
    console.log(`   ✓ Deleted ${scrapeResult.rowCount} scrape history records`);

    console.log('3. Deleting groups...');
    const groupsResult = await client.query('DELETE FROM groups');
    console.log(`   ✓ Deleted ${groupsResult.rowCount} groups`);

    // Commit transaction
    await client.query('COMMIT');

    console.log('\n=================================');
    console.log('Database cleared successfully!');
    console.log('=================================\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error clearing database:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

clearDatabase();
