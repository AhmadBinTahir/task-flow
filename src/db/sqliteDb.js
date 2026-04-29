const fs = require("fs/promises");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

class SqliteDb {
  constructor(filePath) {
    this.filePath = filePath;
    this.ready = this.initialize();
  }

  async initialize() {
    const absolutePath = path.resolve(this.filePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });

    const db = await open({
      filename: absolutePath,
      driver: sqlite3.Database,
    });

    await db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        email_verified_at TEXT,
        verification_token_hash TEXT,
        verification_token_expires_at TEXT,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL CHECK (category IN ('work', 'personal', 'urgent')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'in-progress', 'done')),
        due_date TEXT,
        recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
        recurrence_end_date TEXT,
        priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
        tags TEXT NOT NULL DEFAULT '[]',
        archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_tasks_user_archived ON tasks(user_id, archived);
      CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_tasks_user_priority ON tasks(user_id, priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, due_date);
    `);

    const taskColumns = await db.all("PRAGMA table_info(tasks)");
    const hasRecurrence = taskColumns.some((column) => column.name === "recurrence");
    const hasRecurrenceEndDate = taskColumns.some((column) => column.name === "recurrence_end_date");

    if (!hasRecurrence) {
      await db.exec(
        "ALTER TABLE tasks ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly'))"
      );
    }

    if (!hasRecurrenceEndDate) {
      await db.exec("ALTER TABLE tasks ADD COLUMN recurrence_end_date TEXT");
    }

    return db;
  }

  async run(sql, params = []) {
    const db = await this.ready;
    return db.run(sql, params);
  }

  async get(sql, params = []) {
    const db = await this.ready;
    return db.get(sql, params);
  }

  async all(sql, params = []) {
    const db = await this.ready;
    return db.all(sql, params);
  }

  async close() {
    const db = await this.ready;
    await db.close();
  }
}

module.exports = SqliteDb;
