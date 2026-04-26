const HttpError = require("../utils/httpError");
const {
  validateAuthInput,
  validateLoginInput,
  validateEmailVerificationInput,
} = require("../utils/validators");
const env = require("../config/env");

function authController(authService) {
  return {
    register: async (req, res, next) => {
      try {
        const validated = validateAuthInput(req.body);
        if (validated.errors.length > 0) {
          throw new HttpError(400, "Validation failed", validated.errors);
        }

        const result = await authService.register(validated.clean);
        res.status(201).json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    },

    login: async (req, res, next) => {
      try {
        const payload = validateLoginInput(req.body || {});
        if (payload.errors.length > 0) {
          throw new HttpError(400, "Validation failed", payload.errors);
        }

        const result = await authService.login(payload.clean);
        res.json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    },

    verifyEmail: async (req, res, next) => {
      try {
        const payload = validateEmailVerificationInput(req.body || {});
        if (payload.errors.length > 0) {
          throw new HttpError(400, "Validation failed", payload.errors);
        }
        const result = await authService.verifyEmail(payload.clean);
        res.json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    },

    resendVerification: async (req, res, next) => {
      try {
        const emailInput = String(req.body?.email || "").trim().toLowerCase();
        if (!emailInput || !emailInput.includes("@")) {
          throw new HttpError(400, "valid email is required");
        }
        const result = await authService.resendVerification(emailInput);
        res.json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    },

    me: async (req, res) => {
      res.json({ success: true, user: req.user });
    },

    config: async (_req, res) => {
      res.json({
        success: true,
        auth: {
          mode: env.appMode,
          requiresEmailVerification: env.auth.forceEmailVerification,
          passwordMinLength: env.auth.passwordMinLength,
        },
      });
    },
  };
}

module.exports = authController;
