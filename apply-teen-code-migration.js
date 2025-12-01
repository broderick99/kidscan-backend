const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'kidscan_user',
  password: process.env.DB_PASSWORD || 'KidsCanDB2024',
  database: process.env.DB_NAME || 'kidscan'
});

async function applyMigration() {
  try {
    console.log('Applying teen_code migration...');
    
    // Add teen_code column to profiles table
    await pool.query(`
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS teen_code VARCHAR(5) UNIQUE
    `);
    console.log('Added teen_code column');
    
    // Create index for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_profiles_teen_code ON profiles(teen_code) WHERE teen_code IS NOT NULL
    `);
    console.log('Created index on teen_code');
    
    console.log('Migration applied successfully');
  } catch (error) {
    console.error('Error applying migration:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Run the migration
applyMigration();