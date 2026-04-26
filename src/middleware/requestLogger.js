const fs = require("fs");
const path = require("path");
const morgan = require("morgan");
const env = require("../config/env");

const absoluteLogPath = path.resolve(env.logFile);
fs.mkdirSync(path.dirname(absoluteLogPath), { recursive: true });

const accessLogStream = fs.createWriteStream(absoluteLogPath, { flags: "a" });

const skipInTest = () => env.nodeEnv === "test";
const fileLogger = morgan("combined", { stream: accessLogStream, skip: skipInTest });
const consoleLogger = morgan("dev", { skip: skipInTest });

module.exports = {
  fileLogger,
  consoleLogger,
};
