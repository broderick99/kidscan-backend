import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function resetDatabase() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'kidscan_user',
    password: process.env.DB_PASSWORD || 'KidsCanDB2024',
    database: process.env.DB_NAME || 'kidscan',
  });

  try {
    console.log('🗑️  Dropping all tables...');
    
    // Drop all tables in reverse order of dependencies
    const dropQueries = [
      'DROP TABLE IF EXISTS magic_links CASCADE;',
      'DROP TABLE IF EXISTS refresh_tokens CASCADE;',
      'DROP TABLE IF EXISTS referrals CASCADE;',
      'DROP TABLE IF EXISTS earnings CASCADE;',
      'DROP TABLE IF EXISTS payments CASCADE;',
      'DROP TABLE IF EXISTS tasks CASCADE;',
      'DROP TABLE IF EXISTS service_pickup_days CASCADE;',
      'DROP TABLE IF EXISTS services CASCADE;',
      'DROP TABLE IF EXISTS homes CASCADE;',
      'DROP TABLE IF EXISTS profiles CASCADE;',
      'DROP TABLE IF EXISTS users CASCADE;',
      // Drop functions
      'DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;',
    ];

    for (const query of dropQueries) {
      await pool.query(query);
      console.log(`✅ ${query.split(' ')[2]} dropped`);
    }

    console.log('✅ All tables dropped successfully');
  } catch (error) {
    console.error('❌ Reset failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetDatabase();