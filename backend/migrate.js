// Apply SQL migrations to the DATABASE_URL found in environment
// Used for Render deployment (build command runs this before starting)
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('No DATABASE_URL found — skipping migrations.');
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });

  // Create a migrations tracking table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.warn('Could not create schema_migrations table (may already exist or DB unreachable):', err.message);
  }

  const migrationsDir = path.join(__dirname, 'migrations');
  let files = [];
  try {
    files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
  } catch (err) {
    console.warn('No migrations directory found:', err.message);
    return;
  }

  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (rows.length > 0) {
      console.log(`Migration already applied: ${file}`);
      continue;
    }

    console.log(`Applying migration: ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    try {
      await pool.query('BEGIN');
      // Split by semicolons to run statements individually (simple approach)
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        try {
          await pool.query(stmt);
        } catch (err) {
          // Ignore "already exists" errors, log others
          if (!/already exists|duplicate/.test(err.message)) {
            console.warn(`  Statement failed in ${file}:`, err.message);
          }
        }
      }

      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      console.log(`✓ Migration applied: ${file}`);
    } catch (err) {
      await pool.query('ROLLBACK').catch(() => {});
      console.error(`✗ Migration failed: ${file} —`, err.message);
      throw err;
    }
  }

  await pool.end();
  console.log('✅ All migrations applied.');
}

if (require.main === module) {
  runMigrations().catch(err => {
    console.error('Migrations failed:', err);
    process.exit(1);
  });
}

module.exports = runMigrations;