function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }
  return String(value).toLowerCase() === "true";
}

const env = {
  port: toNumber(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET || "development-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  dbPath: process.env.DB_PATH || process.env.DB_FILE || "data\\task-db.sqlite",
  rateLimitWindowMs: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  rateLimitMax: toNumber(process.env.RATE_LIMIT_MAX, 120),
  logFile: process.env.LOG_FILE || "logs\\access.log",
  nodeEnv: process.env.NODE_ENV || "development",
  appMode: (process.env.APP_MODE || (process.env.NODE_ENV === "production" ? "production" : "development")).toLowerCase(),
  auth: {
    passwordMinLength: toNumber(process.env.AUTH_PASSWORD_MIN_LENGTH, 10),
    maxFailedAttempts: toNumber(process.env.AUTH_MAX_FAILED_ATTEMPTS, 5),
    lockMinutes: toNumber(process.env.AUTH_LOCK_MINUTES, 15),
    verifyTokenTtlMinutes: toNumber(process.env.AUTH_VERIFY_TOKEN_TTL_MINUTES, 30),
    forceEmailVerification:
      process.env.AUTH_FORCE_EMAIL_VERIFICATION !== undefined
        ? toBool(process.env.AUTH_FORCE_EMAIL_VERIFICATION)
        : process.env.NODE_ENV === "production",
  },
  corsOrigin: process.env.CORS_ORIGIN || "*",
  trustProxy: toBool(process.env.TRUST_PROXY, false),
  publicAppUrl: process.env.PUBLIC_APP_URL || `http://localhost:${toNumber(process.env.PORT, 4000)}`,
  security: {
    enableCompression: toBool(process.env.ENABLE_COMPRESSION, true),
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: toNumber(process.env.SMTP_PORT, 587),
    secure: toBool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "",
  },
};

env.isProductionMode = env.appMode === "production";
env.isDevMode = !env.isProductionMode;

module.exports = env;
