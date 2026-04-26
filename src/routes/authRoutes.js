const express = require("express");
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

function createAuthRoutes(authService) {
  const router = express.Router();
  const controller = authController(authService);
  const protectedRoute = authMiddleware(authService);

  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/verify-email", controller.verifyEmail);
  router.post("/resend-verification", controller.resendVerification);
  router.get("/config", controller.config);
  router.get("/me", protectedRoute, controller.me);

  return router;
}

module.exports = createAuthRoutes;
