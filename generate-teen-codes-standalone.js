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

// Character set for teen codes (excludes confusing characters)
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateTeenCode() {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}

async function generateTeenCodesForExistingUsers() {
  try {
    // Get all teens without a teen_code
    const result = await pool.query(
      `SELECT u.id, p.user_id 
       FROM users u
       INNER JOIN profiles p ON u.id = p.user_id
       WHERE u.role = 'teen' AND p.teen_code IS NULL`
    );
    
    console.log(`Found ${result.rows.length} teens without codes`);
    
    for (const teen of result.rows) {
      let teenCode = null;
      let attempts = 0;
      
      // Keep trying until we get a unique code
      while (attempts < 10) {
        teenCode = generateTeenCode();
        const existing = await pool.query(
          'SELECT id FROM profiles WHERE teen_code = $1',
          [teenCode]
        );
        if (existing.rows.length === 0) break;
        attempts++;
      }
      
      if (attempts === 10) {
        // Fallback to 5 character code
        teenCode = generateTeenCode() + Math.floor(Math.random() * 10);
      }
      
      // Update the profile with the teen code
      await pool.query(
        'UPDATE profiles SET teen_code = $1 WHERE user_id = $2',
        [teenCode, teen.user_id]
      );
      
      console.log(`Generated code ${teenCode} for user ${teen.user_id}`);
    }
    
    console.log('Done generating teen codes');
  } catch (error) {
    console.error('Error generating teen codes:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Run the script
generateTeenCodesForExistingUsers();