require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function addFormattedColumns() {
  try {
    console.log('\nAdding formatted columns to messages table...\n');

    // Add timestamp_formatted column
    await pool.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS timestamp_formatted TIMESTAMPTZ;
    `);
    console.log('✓ Added timestamp_formatted column');

    // Add author_phone column
    await pool.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS author_phone TEXT;
    `);
    console.log('✓ Added author_phone column');

    // Update existing rows with formatted values
    console.log('\nUpdating existing rows with formatted values...');

    const result = await pool.query(`
      UPDATE messages
      SET
        timestamp_formatted = to_timestamp(timestamp),
        author_phone = CASE
          WHEN author IS NOT NULL THEN '+' || split_part(author, '@', 1)
          ELSE NULL
        END
      WHERE timestamp_formatted IS NULL OR author_phone IS NULL;
    `);

    console.log(`✓ Updated ${result.rowCount} existing messages\n`);

    console.log('=================================');
    console.log('Migration completed successfully!');
    console.log('=================================\n');

    await pool.end();
  } catch (error) {
    console.error('Error adding columns:', error.message);
    process.exit(1);
  }
}

addFormattedColumns();
