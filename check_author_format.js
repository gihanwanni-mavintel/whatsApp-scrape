require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkAuthorFormat() {
  try {
    console.log('\nChecking author field formats in database...\n');

    const result = await pool.query(`
      SELECT
        author,
        from_number,
        author_phone,
        message_body
      FROM messages
      LIMIT 20;
    `);

    console.log('=================================');
    console.log('Sample of author fields:');
    console.log('=================================\n');

    result.rows.forEach((row, index) => {
      console.log(`${index + 1}.`);
      console.log(`   Author: ${row.author}`);
      console.log(`   From Number: ${row.from_number}`);
      console.log(`   Author Phone: ${row.author_phone}`);
      console.log(`   Message: ${row.message_body ? row.message_body.substring(0, 50) : 'N/A'}...`);
      console.log('');
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkAuthorFormat();
