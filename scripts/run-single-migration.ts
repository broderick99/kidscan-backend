import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function runSingleMigration() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'kidscan_user',
    password: process.env.DB_PASSWORD || 'KidsCanDB2024',
    database: process.env.DB_NAME || 'kidscan',
  });

  try {
    console.log('🚀 Adding referred_by column...');
    
    // Add referred_by column
    await pool.query(`
      ALTER TABLE profiles 
      ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    `);
    
    // Add index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles(referred_by)
    `);
    
    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSingleMigration();