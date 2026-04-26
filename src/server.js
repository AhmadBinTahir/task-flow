const createApp = require("./app");
const env = require("./config/env");

if (env.isProductionMode && env.jwtSecret === "development-secret-change-me") {
  throw new Error("JWT_SECRET must be configured in production mode");
}

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Task Manager server running on http://localhost:${env.port}`);
});
