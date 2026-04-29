const crypto = require("crypto");
const { PRIORITY_WEIGHT } = require("../config/constants");
const HttpError = require("../utils/httpError");

function normalizeTask(task) {
  return {
    ...task,
    priority: task.priority || "medium",
    recurrence: task.recurrence || "none",
    recurrenceEndDate: task.recurrenceEndDate || null,
    tags: Array.isArray(task.tags) ? task.tags : [],
    archived: Boolean(task.archived),
    completedAt: task.completedAt || null,
  };
}

function getTaskField(task, field) {
  if (field === "priority") {
    return PRIORITY_WEIGHT[task.priority] || PRIORITY_WEIGHT.medium;
  }
  if (field === "dueDate") {
    return task.dueDate ? new Date(task.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
  }
  return task[field];
}

function mapTaskRow(row) {
  if (!row) {
    return null;
  }

  let tags = [];
  try {
    const parsed = JSON.parse(row.tags || "[]");
    tags = Array.isArray(parsed) ? parsed : [];
  } catch {
    tags = [];
  }

  return normalizeTask({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    dueDate: row.due_date,
    recurrence: row.recurrence || "none",
    recurrenceEndDate: row.recurrence_end_date,
    priority: row.priority,
    tags,
    archived: row.archived === 1,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

class TaskRepository {
  constructor(db) {
    this.db = db;
  }

  async listByUserId(userId, filters = {}) {
    const {
      status,
      category,
      priority,
      search,
      archived = false,
      due,
      sortBy = "createdAt",
      sortDir = "desc",
      limit,
      offset = 0,
    } = filters;

    const clauses = ["user_id = ?", "archived = ?"];
    const params = [userId, archived ? 1 : 0];

    if (status) {
      clauses.push("status = ?");
      params.push(status);
    }
    if (category) {
      clauses.push("category = ?");
      params.push(category);
    }
    if (priority) {
      clauses.push("priority = ?");
      params.push(priority);
    }

    const rows = await this.db.all(`SELECT * FROM tasks WHERE ${clauses.join(" AND ")}`, params);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const filtered = rows
      .map(mapTaskRow)
      .filter((task) => (archived ? task.archived === true : task.archived === false))
      .filter((task) => {
        if (!search) {
          return true;
        }
        const q = search.toLowerCase();
        return (
          task.title.toLowerCase().includes(q) ||
          (task.description || "").toLowerCase().includes(q) ||
          task.tags.some((tag) => tag.includes(q))
        );
      })
      .filter((task) => {
        if (!due) {
          return true;
        }
        if (due === "none") {
          return !task.dueDate;
        }
        if (!task.dueDate) {
          return false;
        }
        const dueDate = new Date(task.dueDate);
        if (due === "overdue") {
          return dueDate < now && task.status !== "done";
        }
        if (due === "today") {
          return dueDate >= today && dueDate < tomorrow;
        }
        if (due === "upcoming") {
          return dueDate >= tomorrow;
        }
        return true;
      })
      .sort((a, b) => {
        const left = getTaskField(a, sortBy);
        const right = getTaskField(b, sortBy);
        if (left === right) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        }
        if (sortDir === "asc") {
          return left > right ? 1 : -1;
        }
        return left < right ? 1 : -1;
      });

    const total = filtered.length;
    const paginated = filtered.slice(offset, typeof limit === "number" ? offset + limit : undefined);
    return { tasks: paginated, total };
  }

  async findByIdForUser(id, userId) {
    const row = await this.db.get("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [id, userId]);
    return mapTaskRow(row);
  }

  async create(userId, payload) {
    const now = new Date().toISOString();
    const taskId = crypto.randomUUID();

    await this.db.run(
      `INSERT INTO tasks (
        id, user_id, title, description, category, status, due_date, recurrence, recurrence_end_date,
        priority, tags, archived, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        userId,
        payload.title,
        payload.description || "",
        payload.category,
        payload.status,
        payload.dueDate || null,
        payload.recurrence || "none",
        payload.recurrenceEndDate || null,
        payload.priority || "medium",
        JSON.stringify(payload.tags || []),
        payload.archived ? 1 : 0,
        payload.status === "done" ? now : null,
        now,
        now,
      ]
    );

    return this.findByIdForUser(taskId, userId);
  }

  async update(userId, taskId, payload) {
    const current = await this.findByIdForUser(taskId, userId);
    if (!current) {
      return null;
    }

    const now = new Date().toISOString();
    const nextStatus = payload.status || current.status;
    const completedAt =
      nextStatus === "done" ? current.completedAt || now : payload.status ? null : current.completedAt;

    const updatedTask = {
      ...current,
      ...payload,
      recurrence: payload.recurrence || current.recurrence || "none",
      recurrenceEndDate:
        payload.recurrence === "none"
          ? null
          : payload.recurrenceEndDate !== undefined
            ? payload.recurrenceEndDate
            : current.recurrenceEndDate || null,
      completedAt,
      updatedAt: now,
    };

    if (updatedTask.recurrence !== "none" && !updatedTask.dueDate) {
      throw new HttpError(400, "dueDate is required when recurrence is enabled");
    }

    if (updatedTask.recurrence === "none" && updatedTask.recurrenceEndDate) {
      throw new HttpError(400, "recurrenceEndDate is only allowed when recurrence is enabled");
    }

    if (
      updatedTask.recurrenceEndDate &&
      updatedTask.dueDate &&
      new Date(updatedTask.recurrenceEndDate).getTime() < new Date(updatedTask.dueDate).getTime()
    ) {
      throw new HttpError(400, "recurrenceEndDate must be after dueDate");
    }

    await this.db.run(
      `UPDATE tasks SET
        title = ?,
        description = ?,
        category = ?,
        status = ?,
        due_date = ?,
        recurrence = ?,
        recurrence_end_date = ?,
        priority = ?,
        tags = ?,
        archived = ?,
        completed_at = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ?`,
      [
        updatedTask.title,
        updatedTask.description || "",
        updatedTask.category,
        updatedTask.status,
        updatedTask.dueDate || null,
        updatedTask.recurrence,
        updatedTask.recurrenceEndDate || null,
        updatedTask.priority,
        JSON.stringify(updatedTask.tags || []),
        updatedTask.archived ? 1 : 0,
        updatedTask.completedAt,
        updatedTask.updatedAt,
        taskId,
        userId,
      ]
    );

    const becameDone = current.status !== "done" && updatedTask.status === "done";
    if (becameDone) {
      await this.createNextRecurringTask(userId, updatedTask);
    }

    return normalizeTask(updatedTask);
  }

  async delete(userId, taskId) {
    const result = await this.db.run("DELETE FROM tasks WHERE id = ? AND user_id = ?", [taskId, userId]);
    return result.changes > 0;
  }

  async bulkUpdateStatus(userId, taskIds, status) {
    let updatedCount = 0;
    for (const taskId of taskIds) {
      // Keep recurrence behavior consistent with single-task updates.
      // eslint-disable-next-line no-await-in-loop
      const updated = await this.update(userId, taskId, { status });
      if (updated) {
        updatedCount += 1;
      }
    }
    return updatedCount;
  }

  calculateNextDueDate(dueDate, recurrence) {
    const nextDate = new Date(dueDate);
    if (Number.isNaN(nextDate.getTime())) {
      return null;
    }

    if (recurrence === "daily") {
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (recurrence === "weekly") {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (recurrence === "monthly") {
      nextDate.setMonth(nextDate.getMonth() + 1);
    } else {
      return null;
    }

    return nextDate.toISOString();
  }

  async createNextRecurringTask(userId, completedTask) {
    if (completedTask.recurrence === "none" || !completedTask.dueDate) {
      return null;
    }

    const nextDueDate = this.calculateNextDueDate(completedTask.dueDate, completedTask.recurrence);
    if (!nextDueDate) {
      return null;
    }

    if (
      completedTask.recurrenceEndDate &&
      new Date(nextDueDate).getTime() > new Date(completedTask.recurrenceEndDate).getTime()
    ) {
      return null;
    }

    const now = new Date().toISOString();
    const nextTaskId = crypto.randomUUID();

    await this.db.run(
      `INSERT INTO tasks (
        id, user_id, title, description, category, status, due_date, recurrence, recurrence_end_date,
        priority, tags, archived, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nextTaskId,
        userId,
        completedTask.title,
        completedTask.description || "",
        completedTask.category,
        "pending",
        nextDueDate,
        completedTask.recurrence,
        completedTask.recurrenceEndDate || null,
        completedTask.priority || "medium",
        JSON.stringify(completedTask.tags || []),
        0,
        null,
        now,
        now,
      ]
    );

    return this.findByIdForUser(nextTaskId, userId);
  }

  async getInsights(userId) {
    const rows = await this.db.all("SELECT * FROM tasks WHERE user_id = ?", [userId]);
    const now = new Date();
    const tasks = rows.map(mapTaskRow);
    const active = tasks.filter((task) => !task.archived);
    const done = active.filter((task) => task.status === "done").length;
    const overdue = active.filter(
      (task) => task.dueDate && new Date(task.dueDate) < now && task.status !== "done"
    ).length;

    const byStatus = active.reduce(
      (acc, task) => {
        acc[task.status] += 1;
        return acc;
      },
      { pending: 0, "in-progress": 0, done: 0 }
    );

    const byPriority = active.reduce(
      (acc, task) => {
        acc[task.priority] += 1;
        return acc;
      },
      { low: 0, medium: 0, high: 0, critical: 0 }
    );

    const completionRate = active.length === 0 ? 0 : Math.round((done / active.length) * 100);

    return {
      total: active.length,
      completed: done,
      overdue,
      archived: tasks.length - active.length,
      completionRate,
      byStatus,
      byPriority,
    };
  }
}

module.exports = TaskRepository;
