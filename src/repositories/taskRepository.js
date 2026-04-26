const crypto = require("crypto");
const { PRIORITY_WEIGHT } = require("../config/constants");

function normalizeTask(task) {
  return {
    ...task,
    priority: task.priority || "medium",
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

class TaskRepository {
  constructor(db) {
    this.db = db;
  }

  async listByUserId(userId, filters = {}) {
    const data = await this.db.read();
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

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const filtered = data.tasks
      .filter((task) => task.userId === userId)
      .map(normalizeTask)
      .filter((task) => (archived ? task.archived === true : task.archived === false))
      .filter((task) => (status ? task.status === status : true))
      .filter((task) => (category ? task.category === category : true))
      .filter((task) => (priority ? task.priority === priority : true))
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
    const data = await this.db.read();
    const task = data.tasks.find((item) => item.id === id && item.userId === userId);
    return task ? normalizeTask(task) : null;
  }

  async create(userId, payload) {
    const now = new Date().toISOString();
    const task = {
      id: crypto.randomUUID(),
      userId,
      title: payload.title,
      description: payload.description || "",
      category: payload.category,
      status: payload.status,
      dueDate: payload.dueDate || null,
      priority: payload.priority || "medium",
      tags: payload.tags || [],
      archived: payload.archived || false,
      completedAt: payload.status === "done" ? now : null,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.mutate((data) => {
      data.tasks.push(task);
      return data;
    });

    return task;
  }

  async update(userId, taskId, payload) {
    let updatedTask = null;
    const now = new Date().toISOString();

    await this.db.mutate((data) => {
      const index = data.tasks.findIndex((task) => task.id === taskId && task.userId === userId);
      if (index === -1) {
        return data;
      }

      const current = normalizeTask(data.tasks[index]);
      const nextStatus = payload.status || current.status;
      const completedAt =
        nextStatus === "done" ? current.completedAt || now : payload.status ? null : current.completedAt;

      updatedTask = {
        ...current,
        ...payload,
        completedAt,
        updatedAt: now,
      };
      data.tasks[index] = updatedTask;
      return data;
    });

    return updatedTask;
  }

  async delete(userId, taskId) {
    let removed = false;

    await this.db.mutate((data) => {
      const before = data.tasks.length;
      data.tasks = data.tasks.filter((task) => !(task.id === taskId && task.userId === userId));
      removed = data.tasks.length !== before;
      return data;
    });

    return removed;
  }

  async bulkUpdateStatus(userId, taskIds, status) {
    let updatedCount = 0;
    const now = new Date().toISOString();

    await this.db.mutate((data) => {
      data.tasks = data.tasks.map((item) => {
        if (item.userId !== userId || !taskIds.includes(item.id)) {
          return item;
        }
        updatedCount += 1;
        const next = normalizeTask(item);
        return {
          ...next,
          status,
          completedAt: status === "done" ? next.completedAt || now : null,
          updatedAt: now,
        };
      });
      return data;
    });

    return updatedCount;
  }

  async getInsights(userId) {
    const data = await this.db.read();
    const now = new Date();
    const tasks = data.tasks.filter((task) => task.userId === userId).map(normalizeTask);
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
