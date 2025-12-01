const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  // You can choose which connection to use:
  
  // Option 1: Use your provided credentials (uncomment this block)
  /*
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'kidscan_dev',
  });
  */
  
  // Option 2: Use the existing project's .env configuration (currently active)
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'kidscan_user',
    password: process.env.DB_PASSWORD || 'KidsCanDB2024',
    database: process.env.DB_NAME || 'kidscan',
  });
  
  console.log(`📊 Database connection details:`);
  console.log(`   Host: ${pool.options.host}`);
  console.log(`   Port: ${pool.options.port}`);
  console.log(`   Database: ${pool.options.database}`);
  console.log(`   User: ${pool.options.user}`);

  try {
    console.log('🚀 Connecting to database...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'src/database/migrations/009_add_seeking_helper_to_homes.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Running migration: 009_add_seeking_helper_to_homes.sql');
    console.log('SQL to execute:');
    console.log(migrationSQL);
    console.log('');
    
    // Execute the migration
    await pool.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the changes
    console.log('\n🔍 Verifying changes...');
    
    // Check if columns were added
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'homes' 
      AND column_name IN ('seeking_helper', 'seeking_helper_requested_at')
      ORDER BY column_name;
    `);
    
    console.log('\nNew columns added:');
    columnsResult.rows.forEach(col => {
      console.log(`- ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default})`);
    });
    
    // Check if index was created
    const indexResult = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'homes' 
      AND indexname = 'idx_homes_seeking_helper';
    `);
    
    if (indexResult.rows.length > 0) {
      console.log('\nIndex created:');
      console.log(`- ${indexResult.rows[0].indexname}`);
      console.log(`  Definition: ${indexResult.rows[0].indexdef}`);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.code === '42701') {
      console.log('\n⚠️  It looks like the columns might already exist. This could mean the migration was already applied.');
    }
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n👋 Database connection closed.');
  }
}

// Run the migration
runMigration();