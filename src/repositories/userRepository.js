const crypto = require("crypto");

class UserRepository {
  constructor(db) {
    this.db = db;
  }

  async findByEmail(email) {
    const data = await this.db.read();
    return data.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async findById(userId) {
    const data = await this.db.read();
    return data.users.find((user) => user.id === userId) || null;
  }

  async create({ name, email, passwordHash, emailVerifiedAt, verificationTokenHash, verificationTokenExpiresAt }) {
    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      name,
      email: email.toLowerCase(),
      passwordHash,
      emailVerifiedAt: emailVerifiedAt || null,
      verificationTokenHash: verificationTokenHash || null,
      verificationTokenExpiresAt: verificationTokenExpiresAt || null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.mutate((data) => {
      data.users.push(user);
      return data;
    });

    return user;
  }

  async updateById(userId, partial) {
    let updated = null;
    await this.db.mutate((data) => {
      const index = data.users.findIndex((user) => user.id === userId);
      if (index === -1) {
        return data;
      }
      updated = {
        ...data.users[index],
        ...partial,
        updatedAt: new Date().toISOString(),
      };
      data.users[index] = updated;
      return data;
    });
    return updated;
  }
}

module.exports = UserRepository;
