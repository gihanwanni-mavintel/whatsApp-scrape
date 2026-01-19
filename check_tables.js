require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkTables() {
  try {
    console.log('\nChecking database tables...\n');

    // Check if tables exist
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('=================================');
    console.log('Existing tables in database:');
    console.log('=================================');

    if (result.rows.length === 0) {
      console.log('No tables found!');
    } else {
      result.rows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.table_name}`);
      });
    }

    console.log('\n=================================');
    console.log('Expected tables: groups, messages, scrape_history');
    console.log('=================================\n');

    await pool.end();
  } catch (error) {
    console.error('Error checking tables:', error.message);
    process.exit(1);
  }
}

checkTables();
