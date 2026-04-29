const path = require("path");
const fs = require("fs/promises");
const request = require("supertest");

const testDbFile = path.resolve("data", "task-db.test.sqlite");
const testLogFile = path.resolve("logs", "access.test.log");
const managedApps = [];

async function cleanupFiles() {
  await fs.rm(testDbFile, { force: true });
  await fs.rm(`${testDbFile}-shm`, { force: true });
  await fs.rm(`${testDbFile}-wal`, { force: true });
  await fs.rm(testLogFile, { force: true });
}

async function buildApp(overrides = {}) {
  process.env.NODE_ENV = "test";
  process.env.APP_MODE = "development";
  process.env.DB_PATH = testDbFile;
  delete process.env.DB_FILE;
  process.env.LOG_FILE = testLogFile;
  process.env.JWT_SECRET = "test-secret";
  process.env.RATE_LIMIT_MAX = "1000";
  process.env.RATE_LIMIT_WINDOW_MS = "60000";
  process.env.AUTH_FORCE_EMAIL_VERIFICATION = "false";
  process.env.AUTH_PASSWORD_MIN_LENGTH = "8";

  Object.entries(overrides).forEach(([key, value]) => {
    process.env[key] = String(value);
  });

  jest.resetModules();
  const createApp = require("../src/app");
  const app = createApp();
  managedApps.push(app);
  return app;
}

beforeEach(async () => {
  await cleanupFiles();
});

afterEach(async () => {
  while (managedApps.length > 0) {
    const app = managedApps.pop();
    await app.locals.db.close();
  }
  await cleanupFiles();
});

afterAll(async () => {
  await cleanupFiles();
});

describe("Task Management API", () => {
  test("register, login, and fetch profile", async () => {
    const app = await buildApp();

    const registerRes = await request(app).post("/api/auth/register").send({
      name: "Demo User",
      email: "demo@example.com",
      password: "secret123",
    });
    expect(registerRes.statusCode).toBe(201);
    expect(registerRes.body.token).toBeTruthy();

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "demo@example.com",
      password: "secret123",
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body.token).toBeTruthy();

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${loginRes.body.token}`);
    expect(meRes.statusCode).toBe(200);
    expect(meRes.body.user.email).toBe("demo@example.com");
  });

  test("task CRUD with auth", async () => {
    const app = await buildApp();

    const authRes = await request(app).post("/api/auth/register").send({
      name: "Task User",
      email: "tasks@example.com",
      password: "secret123",
    });
    const token = authRes.body.token;

    const createRes = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Ship release",
        description: "Finalize release notes",
        category: "work",
        status: "in-progress",
        priority: "high",
        tags: ["release", "q2"],
      });
    expect(createRes.statusCode).toBe(201);
    expect(createRes.body.task.title).toBe("Ship release");
    expect(createRes.body.task.priority).toBe("high");

    const taskId = createRes.body.task.id;

    const listRes = await request(app)
      .get("/api/tasks?status=in-progress&priority=high")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.tasks).toHaveLength(1);
    expect(listRes.body.total).toBe(1);

    const updateRes = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "done" });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.body.task.status).toBe("done");

    const deleteRes = await request(app)
      .delete(`/api/tasks/${taskId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleteRes.statusCode).toBe(200);
  });

  test("insights and bulk status update", async () => {
    const app = await buildApp();

    const authRes = await request(app).post("/api/auth/register").send({
      name: "Insights User",
      email: "insights@example.com",
      password: "secret123",
    });
    const token = authRes.body.token;

    const createOne = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Personal admin",
        description: "Sort bills",
        category: "personal",
        status: "pending",
        priority: "medium",
      });

    const createTwo = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Urgent follow-up",
        description: "Client outage call",
        category: "urgent",
        status: "in-progress",
        priority: "critical",
      });

    const bulkRes = await request(app)
      .patch("/api/tasks/bulk/status")
      .set("Authorization", `Bearer ${token}`)
      .send({
        taskIds: [createOne.body.task.id, createTwo.body.task.id],
        status: "done",
      });
    expect(bulkRes.statusCode).toBe(200);
    expect(bulkRes.body.updatedCount).toBe(2);

    const insightsRes = await request(app)
      .get("/api/tasks/insights")
      .set("Authorization", `Bearer ${token}`);
    expect(insightsRes.statusCode).toBe(200);
    expect(insightsRes.body.insights.total).toBe(2);
    expect(insightsRes.body.insights.byStatus.done).toBe(2);
  });

  test("recurring task creates next occurrence when marked done", async () => {
    const app = await buildApp();

    const authRes = await request(app).post("/api/auth/register").send({
      name: "Recurring User",
      email: "recurring@example.com",
      password: "secret123",
    });
    const token = authRes.body.token;

    const baseDueDate = new Date("2026-05-01T10:00:00.000Z").toISOString();
    const createRes = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Weekly planning",
        description: "Prepare sprint priorities",
        category: "work",
        status: "in-progress",
        priority: "high",
        dueDate: baseDueDate,
        recurrence: "weekly",
      });

    expect(createRes.statusCode).toBe(201);

    const completeRes = await request(app)
      .patch(`/api/tasks/${createRes.body.task.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "done" });

    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.body.task.status).toBe("done");

    const listRes = await request(app).get("/api/tasks").set("Authorization", `Bearer ${token}`);
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.total).toBe(2);

    const pendingRecurring = listRes.body.tasks.find((task) => task.status === "pending");
    expect(pendingRecurring).toBeTruthy();
    expect(pendingRecurring.recurrence).toBe("weekly");
    expect(pendingRecurring.dueDate).toBe(new Date("2026-05-08T10:00:00.000Z").toISOString());
  });

  test("update rejects recurrenceEndDate when recurrence is none", async () => {
    const app = await buildApp();

    const authRes = await request(app).post("/api/auth/register").send({
      name: "Validation User",
      email: "validation@example.com",
      password: "secret123",
    });
    const token = authRes.body.token;

    const createRes = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "One-off task",
        description: "No recurrence",
        category: "work",
        status: "pending",
        priority: "medium",
      });

    expect(createRes.statusCode).toBe(201);
    expect(createRes.body.task.recurrence).toBe("none");

    const updateRes = await request(app)
      .patch(`/api/tasks/${createRes.body.task.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        recurrenceEndDate: new Date("2026-06-01T00:00:00.000Z").toISOString(),
      });

    expect(updateRes.statusCode).toBe(400);
    expect(updateRes.body.message).toContain(
      "recurrenceEndDate is only allowed when recurrence is enabled"
    );
  });

  test("production mode requires email verification before login", async () => {
    const app = await buildApp({
      APP_MODE: "production",
      AUTH_FORCE_EMAIL_VERIFICATION: "true",
      AUTH_PASSWORD_MIN_LENGTH: "10",
    });

    const registerRes = await request(app).post("/api/auth/register").send({
      name: "Prod User",
      email: "prod@example.com",
      password: "Stronger#123",
    });
    expect(registerRes.statusCode).toBe(201);
    expect(registerRes.body.requiresEmailVerification).toBe(true);
    expect(registerRes.body.token).toBeFalsy();
    expect(registerRes.body.verificationToken).toBeTruthy();

    const loginBeforeVerify = await request(app).post("/api/auth/login").send({
      email: "prod@example.com",
      password: "Stronger#123",
    });
    expect(loginBeforeVerify.statusCode).toBe(403);

    const verifyRes = await request(app).post("/api/auth/verify-email").send({
      email: "prod@example.com",
      token: registerRes.body.verificationToken,
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.body.verified).toBe(true);

    const loginAfterVerify = await request(app).post("/api/auth/login").send({
      email: "prod@example.com",
      password: "Stronger#123",
    });
    expect(loginAfterVerify.statusCode).toBe(200);
    expect(loginAfterVerify.body.token).toBeTruthy();
  });

  test("account lockout after repeated failed login attempts", async () => {
    const app = await buildApp({
      APP_MODE: "production",
      AUTH_FORCE_EMAIL_VERIFICATION: "false",
      AUTH_MAX_FAILED_ATTEMPTS: "3",
      AUTH_LOCK_MINUTES: "20",
      AUTH_PASSWORD_MIN_LENGTH: "10",
    });

    const registerRes = await request(app).post("/api/auth/register").send({
      name: "Lock User",
      email: "lock@example.com",
      password: "Locked#1234",
    });
    expect(registerRes.statusCode).toBe(201);

    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const failed = await request(app).post("/api/auth/login").send({
        email: "lock@example.com",
        password: "wrong-pass",
      });
      expect(failed.statusCode).toBe(401);
    }

    const locked = await request(app).post("/api/auth/login").send({
      email: "lock@example.com",
      password: "Locked#1234",
    });
    expect(locked.statusCode).toBe(423);
  });
});
