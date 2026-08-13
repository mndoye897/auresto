// Apply SQL migrations to the DATABASE_URL found in environment
// Used for Render deployment (build command runs this before starting)
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// En local, DATABASE_URL vit dans backend/.env. Sans ce chargement, les
// migrations étaient silencieusement ignorées au lancement via `npm start`
// (server.js charge dotenv, migrate.js ne le faisait pas).
require('dotenv').config({ path: path.join(__dirname, '.env') });

/**
 * Découpe un script SQL en instructions, en ignorant les points-virgules
 * situés dans un commentaire (-- ... / * ... * /) ou dans une chaîne.
 */
function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inSingle = false, inLineComment = false, inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      current += ch;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; current += '*/'; i++; continue; }
      current += ch;
      continue;
    }
    if (inSingle) {
      current += ch;
      // '' est un apostrophe échappé à l'intérieur d'une chaîne SQL
      if (ch === "'") {
        if (next === "'") { current += "'"; i++; }
        else inSingle = false;
      }
      continue;
    }

    if (ch === '-' && next === '-') { inLineComment = true; current += '--'; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; current += '/*'; i++; continue; }
    if (ch === "'") { inSingle = true; current += ch; continue; }

    if (ch === ';') { statements.push(current); current = ''; continue; }
    current += ch;
  }
  statements.push(current);

  // Une instruction réduite à des commentaires ou du vide n'est pas exécutable.
  return statements
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().length > 0);
}

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
      // Découpage des instructions. Un simple split(';') casse dès qu'un
      // point-virgule apparaît dans un commentaire ou une chaîne : on
      // ignore donc les zones commentées et les littéraux entre quotes.
      const statements = splitSqlStatements(sql);

      const failures = [];
      for (const stmt of statements) {
        try {
          await pool.query(stmt);
        } catch (err) {
          // Ignore "already exists" errors, log others
          if (!/already exists|duplicate/.test(err.message)) {
            console.warn(`  Statement failed in ${file}:`, err.message);
            failures.push(err.message);
          }
        }
      }

      // Ne jamais marquer une migration comme appliquée si une instruction
      // a échoué : sinon elle ne sera plus rejouée et le schéma reste cassé.
      if (failures.length) {
        throw new Error(`${failures.length} instruction(s) en échec — migration non enregistrée`);
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