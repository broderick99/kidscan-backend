import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  const pool = databaseUrl
    ? new Pool({
        connectionString: databaseUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      })
    : new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'kidscan_user',
        password: process.env.DB_PASSWORD || 'KidsCanDB2024',
        database: process.env.DB_NAME || 'kidscan',
      });

  try {
    console.log('🚀 Running database migrations...');

    // Look for migrations in the source directory
    const srcMigrationsDir = path.join(__dirname, '..', '..', 'src', 'database', 'migrations');
    const distMigrationsDir = path.join(__dirname, '..', 'src', 'database', 'migrations');

    // Check if we're running from dist or src
    const migrationsDir = fs.existsSync(srcMigrationsDir) ? srcMigrationsDir : distMigrationsDir;
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    const client = await pool.connect();

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          file_name VARCHAR(255) PRIMARY KEY,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const appliedResult = await client.query<{ file_name: string }>(
        'SELECT file_name FROM schema_migrations',
      );
      const applied = new Set(appliedResult.rows.map(row => row.file_name));

      for (const file of files) {
        if (applied.has(file)) {
          console.log(`⏭️  Skipping already applied migration: ${file}`);
          continue;
        }

        console.log(`📝 Running migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (file_name) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`✅ Migration ${file} completed`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      client.release();
    }

    console.log('✅ All migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
