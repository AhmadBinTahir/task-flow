const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const env = require("../config/env");
const HttpError = require("../utils/httpError");

class AuthService {
  constructor(userRepository, emailService) {
    this.userRepository = userRepository;
    this.emailService = emailService;
  }

  createToken(user) {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
      },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );
  }

  async register({ name, email, password }) {
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new HttpError(409, "User with this email already exists");
    }

    const now = new Date();
    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenHash = this.hashToken(verificationToken);
    const verifyExpires = new Date(now.getTime() + env.auth.verifyTokenTtlMinutes * 60 * 1000).toISOString();
    const requiresVerification = env.auth.forceEmailVerification;

    const user = await this.userRepository.create({
      name,
      email,
      passwordHash,
      emailVerifiedAt: requiresVerification ? null : now.toISOString(),
      verificationTokenHash: requiresVerification ? verificationTokenHash : null,
      verificationTokenExpiresAt: requiresVerification ? verifyExpires : null,
    });

    if (requiresVerification) {
      await this.emailService.sendVerificationEmail({ email: user.email, name: user.name, token: verificationToken });
      return {
        user: this.toPublicUser(user),
        requiresEmailVerification: true,
        verificationToken: env.isDevMode || env.nodeEnv === "test" ? verificationToken : undefined,
      };
    }

    const token = this.createToken(user);
    return { user: this.toPublicUser(user), token, requiresEmailVerification: false };
  }

  async login({ email, password }) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new HttpError(401, "Invalid email or password");
    }

    if (this.isLocked(user)) {
      throw new HttpError(423, "Account is temporarily locked due to failed login attempts");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.recordFailedAttempt(user);
      throw new HttpError(401, "Invalid email or password");
    }

    if (env.auth.forceEmailVerification && !user.emailVerifiedAt) {
      throw new HttpError(403, "Email is not verified");
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.userRepository.updateById(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
    }

    const token = this.createToken(user);
    return { user: this.toPublicUser(user), token };
  }

  async verifyEmail({ email, token }) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new HttpError(404, "User not found");
    }
    if (user.emailVerifiedAt) {
      return { verified: true, alreadyVerified: true };
    }

    if (!user.verificationTokenHash || !user.verificationTokenExpiresAt) {
      throw new HttpError(400, "No verification request is active");
    }
    if (new Date(user.verificationTokenExpiresAt) < new Date()) {
      throw new HttpError(410, "Verification token expired");
    }

    const incomingHash = this.hashToken(token);
    if (incomingHash !== user.verificationTokenHash) {
      throw new HttpError(401, "Invalid verification token");
    }

    await this.userRepository.updateById(user.id, {
      emailVerifiedAt: new Date().toISOString(),
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
    });
    return { verified: true, alreadyVerified: false };
  }

  async resendVerification(email) {
    if (!env.auth.forceEmailVerification) {
      return { sent: false, reason: "verification_not_required" };
    }
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new HttpError(404, "User not found");
    }
    if (user.emailVerifiedAt) {
      return { sent: false, reason: "already_verified" };
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenHash = this.hashToken(verificationToken);
    const expiresAt = new Date(Date.now() + env.auth.verifyTokenTtlMinutes * 60 * 1000).toISOString();
    await this.userRepository.updateById(user.id, {
      verificationTokenHash,
      verificationTokenExpiresAt: expiresAt,
    });
    await this.emailService.sendVerificationEmail({
      email: user.email,
      name: user.name,
      token: verificationToken,
    });

    return {
      sent: true,
      verificationToken: env.isDevMode || env.nodeEnv === "test" ? verificationToken : undefined,
    };
  }

  async verifyToken(token) {
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      const user = await this.userRepository.findById(payload.sub);
      if (!user) {
        throw new HttpError(401, "Authentication failed");
      }
      return this.toPublicUser(user);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(401, "Invalid or expired token");
    }
  }

  hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  isLocked(user) {
    return Boolean(user.lockedUntil && new Date(user.lockedUntil) > new Date());
  }

  async recordFailedAttempt(user) {
    const failedAttempts = (user.failedLoginAttempts || 0) + 1;
    const shouldLock = failedAttempts >= env.auth.maxFailedAttempts;
    await this.userRepository.updateById(user.id, {
      failedLoginAttempts: failedAttempts,
      lockedUntil: shouldLock ? new Date(Date.now() + env.auth.lockMinutes * 60 * 1000).toISOString() : null,
    });
  }

  toPublicUser(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

module.exports = AuthService;
