const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const SqliteDb = require("./db/sqliteDb");
const env = require("./config/env");
const apiLimiter = require("./middleware/rateLimiter");
const { fileLogger, consoleLogger } = require("./middleware/requestLogger");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const UserRepository = require("./repositories/userRepository");
const TaskRepository = require("./repositories/taskRepository");
const AuthService = require("./services/authService");
const EmailService = require("./services/emailService");
const createAuthRoutes = require("./routes/authRoutes");
const createTaskRoutes = require("./routes/taskRoutes");
const authMiddleware = require("./middleware/authMiddleware");

function createApp() {
  const app = express();
  const db = new SqliteDb(env.dbPath);
  app.locals.db = db;
  const userRepository = new UserRepository(db);
  const taskRepository = new TaskRepository(db);
  const emailService = new EmailService();
  const authService = new AuthService(userRepository, emailService);
  const apiAuth = authMiddleware(authService);

  if (env.trustProxy) {
    app.set("trust proxy", 1);
  }

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: env.corsOrigin === "*" ? true : env.corsOrigin,
      credentials: true,
    })
  );
  if (env.security.enableCompression) {
    app.use(compression());
  }
  app.use(express.json({ limit: "1mb" }));
  app.use(fileLogger);
  app.use(consoleLogger);
  app.use("/api", apiLimiter);

  app.get("/api/health", (_req, res) => {
    res.json({
      success: true,
      status: "ok",
      env: env.nodeEnv,
    });
  });

  app.use("/api/auth", createAuthRoutes(authService));
  app.use("/api/tasks", apiAuth, createTaskRoutes(taskRepository));

  const publicDir = path.resolve("public");
  app.use(express.static(publicDir));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
