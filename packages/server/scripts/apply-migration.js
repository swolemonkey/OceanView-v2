const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Path to the migration SQL file
const migrationDir = path.join(__dirname, '../prisma/migrations/20240525_add_symbol_registry');
const migrationFile = path.join(migrationDir, 'migration.sql');

// Create migration directory if it doesn't exist
if (!fs.existsSync(migrationDir)) {
  fs.mkdirSync(migrationDir, { recursive: true });
  console.log(`Created migration directory: ${migrationDir}`);
}

// Function to apply the migration
function applyMigration() {
  try {
    console.log('Applying database migration...');
    
    // Get the database file path from schema.prisma
    const prismaSchema = fs.readFileSync(path.join(__dirname, '../../../schema.prisma'), 'utf8');
    const dbUrlMatch = prismaSchema.match(/url\s*=\s*"file:(.*?)"/);
    
    if (!dbUrlMatch) {
      console.error('Could not find database URL in schema.prisma');
      process.exit(1);
    }
    
    const dbPath = dbUrlMatch[1].trim();
    const fullDbPath = path.join(__dirname, '../../../', dbPath);
    
    console.log(`Using database at: ${fullDbPath}`);
    
    // Check if the database file exists
    if (!fs.existsSync(fullDbPath)) {
      console.error(`Database file not found: ${fullDbPath}`);
      process.exit(1);
    }
    
    // Read the migration SQL
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    // Write migration SQL to a temporary file
    const tempSqlFile = path.join(__dirname, 'temp-migration.sql');
    fs.writeFileSync(tempSqlFile, sql);
    
    // Execute the SQL against the database
    console.log('Running SQL migration...');
    execSync(`sqlite3 "${fullDbPath}" < "${tempSqlFile}"`, { stdio: 'inherit' });
    
    // Clean up temporary file
    fs.unlinkSync(tempSqlFile);
    
    // Create migration info in _prisma_migrations table to mark it as applied
    const migrationName = '20240525_add_symbol_registry';
    const timestamp = new Date().toISOString();
    
    const migrationInfoSql = `
      CREATE TABLE IF NOT EXISTS _prisma_migrations (
        id TEXT PRIMARY KEY NOT NULL,
        checksum TEXT NOT NULL,
        finished_at DATETIME,
        migration_name TEXT NOT NULL,
        logs TEXT,
        rolled_back_at DATETIME,
        started_at DATETIME NOT NULL,
        applied_steps_count INTEGER NOT NULL
      );
      
      INSERT INTO _prisma_migrations (
        id, checksum, migration_name, started_at, finished_at, applied_steps_count
      ) VALUES (
        '${migrationName}', 'manual', '${migrationName}', '${timestamp}', '${timestamp}', 1
      );
    `;
    
    // Write migration info SQL to a temporary file
    const tempMigrationInfoFile = path.join(__dirname, 'temp-migration-info.sql');
    fs.writeFileSync(tempMigrationInfoFile, migrationInfoSql);
    
    // Execute the migration info SQL
    console.log('Recording migration in _prisma_migrations table...');
    execSync(`sqlite3 "${fullDbPath}" < "${tempMigrationInfoFile}"`, { stdio: 'inherit' });
    
    // Clean up temporary file
    fs.unlinkSync(tempMigrationInfoFile);
    
    console.log('Migration applied successfully!');
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

// Run the migration
applyMigration(); 