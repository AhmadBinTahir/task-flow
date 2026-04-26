const HttpError = require("../utils/httpError");

function authMiddleware(authService) {
  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization || "";
      const [, token] = header.split(" ");

      if (!token) {
        throw new HttpError(401, "Authorization token is required");
      }

      req.user = await authService.verifyToken(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = authMiddleware;
