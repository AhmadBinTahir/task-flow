const HttpError = require("../utils/httpError");

function notFoundHandler(_req, _res, next) {
  next(new HttpError(404, "Route not found"));
}

function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || 500;
  const payload = {
    success: false,
    message: err.message || "Internal server error",
  };

  if (err.details) {
    payload.details = err.details;
  }

  if (statusCode === 500) {
    payload.message = "Internal server error";
  }

  res.status(statusCode).json(payload);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
