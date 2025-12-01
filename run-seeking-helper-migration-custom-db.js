const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  // Using your specific connection details
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'kidscan_dev',
  });
  
  console.log(`📊 Database connection details:`);
  console.log(`   Host: ${pool.options.host}`);
  console.log(`   Port: ${pool.options.port}`);
  console.log(`   Database: ${pool.options.database}`);
  console.log(`   User: ${pool.options.user}`);

  try {
    console.log('\n🚀 Connecting to database...');
    
    // Test connection first
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful!');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'src/database/migrations/009_add_seeking_helper_to_homes.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('\n📄 Running migration: 009_add_seeking_helper_to_homes.sql');
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
    console.error('\n❌ Migration failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️  Could not connect to the database. Please ensure PostgreSQL is running and the connection details are correct.');
    } else if (error.code === '28P01') {
      console.log('\n⚠️  Authentication failed. Please check your username and password.');
    } else if (error.code === '3D000') {
      console.log('\n⚠️  Database "kidscan_dev" does not exist. Please create it first.');
    } else if (error.code === '42P01') {
      console.log('\n⚠️  Table "homes" does not exist. Please ensure you have run the initial migrations.');
    } else if (error.code === '42701') {
      console.log('\n⚠️  The columns already exist. This migration may have been applied previously.');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n👋 Database connection closed.');
  }
}

// Run the migration
runMigration();