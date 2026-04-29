const crypto = require("crypto");

function mapUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    emailVerifiedAt: row.email_verified_at,
    verificationTokenHash: row.verification_token_hash,
    verificationTokenExpiresAt: row.verification_token_expires_at,
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class UserRepository {
  constructor(db) {
    this.db = db;
  }

  async findByEmail(email) {
    const row = await this.db.get("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);
    return mapUserRow(row);
  }

  async findById(userId) {
    const row = await this.db.get("SELECT * FROM users WHERE id = ?", [userId]);
    return mapUserRow(row);
  }

  async create({ name, email, passwordHash, emailVerifiedAt, verificationTokenHash, verificationTokenExpiresAt }) {
    const now = new Date().toISOString();
    const userId = crypto.randomUUID();

    await this.db.run(
      `INSERT INTO users (
        id, name, email, password_hash, email_verified_at,
        verification_token_hash, verification_token_expires_at,
        failed_login_attempts, locked_until, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        name,
        email.toLowerCase(),
        passwordHash,
        emailVerifiedAt || null,
        verificationTokenHash || null,
        verificationTokenExpiresAt || null,
        0,
        null,
        now,
        now,
      ]
    );

    return this.findById(userId);
  }

  async updateById(userId, partial) {
    const columns = {
      name: "name",
      email: "email",
      passwordHash: "password_hash",
      emailVerifiedAt: "email_verified_at",
      verificationTokenHash: "verification_token_hash",
      verificationTokenExpiresAt: "verification_token_expires_at",
      failedLoginAttempts: "failed_login_attempts",
      lockedUntil: "locked_until",
    };

    const updates = [];
    const values = [];

    Object.entries(columns).forEach(([key, column]) => {
      if (partial[key] !== undefined) {
        updates.push(`${column} = ?`);
        values.push(key === "email" ? String(partial[key]).toLowerCase() : partial[key]);
      }
    });

    if (updates.length === 0) {
      return this.findById(userId);
    }

    const now = new Date().toISOString();
    updates.push("updated_at = ?");
    values.push(now, userId);

    const result = await this.db.run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);
    if (!result.changes) {
      return null;
    }

    return this.findById(userId);
  }
}

module.exports = UserRepository;
