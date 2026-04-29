const TASK_CATEGORIES = ["work", "personal", "urgent"];
const TASK_STATUSES = ["pending", "in-progress", "done"];
const TASK_PRIORITIES = ["low", "medium", "high", "critical"];
const TASK_RECURRENCES = ["none", "daily", "weekly", "monthly"];
const TASK_SORT_FIELDS = ["createdAt", "updatedAt", "dueDate", "priority", "title", "status"];
const PRIORITY_WEIGHT = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

module.exports = {
  TASK_CATEGORIES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_RECURRENCES,
  TASK_SORT_FIELDS,
  PRIORITY_WEIGHT,
};
