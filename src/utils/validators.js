const {
  TASK_CATEGORIES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_RECURRENCES,
  TASK_SORT_FIELDS,
} = require("../config/constants");
const env = require("../config/env");

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateTaskInput(payload, { partial = false } = {}) {
  const errors = [];
  const clean = {};

  if (!partial || payload.title !== undefined) {
    if (!isNonEmptyString(payload.title)) {
      errors.push("title is required and must be a non-empty string");
    } else if (payload.title.trim().length < 3 || payload.title.trim().length > 120) {
      errors.push("title must be between 3 and 120 characters");
    } else {
      clean.title = payload.title.trim();
    }
  }

  if (payload.description !== undefined) {
    if (payload.description !== null && typeof payload.description !== "string") {
      errors.push("description must be a string");
    } else if ((payload.description || "").length > 2000) {
      errors.push("description must not exceed 2000 characters");
    } else {
      clean.description = payload.description ? payload.description.trim() : "";
    }
  }

  if (!partial || payload.category !== undefined) {
    if (!TASK_CATEGORIES.includes(payload.category)) {
      errors.push(`category must be one of: ${TASK_CATEGORIES.join(", ")}`);
    } else {
      clean.category = payload.category;
    }
  }

  if (!partial || payload.status !== undefined) {
    if (!TASK_STATUSES.includes(payload.status)) {
      errors.push(`status must be one of: ${TASK_STATUSES.join(", ")}`);
    } else {
      clean.status = payload.status;
    }
  }

  if (payload.dueDate !== undefined) {
    if (payload.dueDate && Number.isNaN(Date.parse(payload.dueDate))) {
      errors.push("dueDate must be a valid ISO date string");
    } else {
      clean.dueDate = payload.dueDate || null;
    }
  }

  if (!partial || payload.recurrence !== undefined) {
    const recurrence = payload.recurrence || "none";
    if (!TASK_RECURRENCES.includes(recurrence)) {
      errors.push(`recurrence must be one of: ${TASK_RECURRENCES.join(", ")}`);
    } else {
      clean.recurrence = recurrence;
    }
  }

  if (payload.recurrenceEndDate !== undefined) {
    if (payload.recurrenceEndDate && Number.isNaN(Date.parse(payload.recurrenceEndDate))) {
      errors.push("recurrenceEndDate must be a valid ISO date string");
    } else {
      clean.recurrenceEndDate = payload.recurrenceEndDate || null;
    }
  }

  if (!partial || payload.priority !== undefined) {
    const priority = payload.priority || "medium";
    if (!TASK_PRIORITIES.includes(priority)) {
      errors.push(`priority must be one of: ${TASK_PRIORITIES.join(", ")}`);
    } else {
      clean.priority = priority;
    }
  }

  if (payload.tags !== undefined) {
    if (!Array.isArray(payload.tags)) {
      errors.push("tags must be an array of strings");
    } else {
      const normalizedTags = payload.tags
        .map((tag) => (typeof tag === "string" ? tag.trim().toLowerCase() : ""))
        .filter(Boolean);
      if (normalizedTags.length !== payload.tags.length) {
        errors.push("tags must contain non-empty strings only");
      } else if (normalizedTags.length > 10) {
        errors.push("tags must contain up to 10 values");
      } else if (normalizedTags.some((tag) => tag.length > 30)) {
        errors.push("each tag must be 30 characters or less");
      } else {
        clean.tags = Array.from(new Set(normalizedTags));
      }
    }
  }

  if (payload.archived !== undefined) {
    if (typeof payload.archived !== "boolean") {
      errors.push("archived must be a boolean");
    } else {
      clean.archived = payload.archived;
    }
  }

  const resolvedRecurrence =
    clean.recurrence !== undefined
      ? clean.recurrence
      : !partial
        ? "none"
        : payload.recurrence;
  const hasDueDate = clean.dueDate !== undefined ? Boolean(clean.dueDate) : Boolean(payload.dueDate);
  if (resolvedRecurrence && resolvedRecurrence !== "none" && !hasDueDate) {
    errors.push("dueDate is required when recurrence is enabled");
  }

  if (
    clean.recurrenceEndDate &&
    clean.dueDate &&
    new Date(clean.recurrenceEndDate).getTime() < new Date(clean.dueDate).getTime()
  ) {
    errors.push("recurrenceEndDate must be after dueDate");
  }

  if (clean.recurrence === "none" && clean.recurrenceEndDate) {
    errors.push("recurrenceEndDate is only allowed when recurrence is enabled");
  }

  return { errors, clean };
}

function validateTaskQuery(query) {
  const errors = [];
  const clean = {};

  if (query.status !== undefined && query.status !== "" && !TASK_STATUSES.includes(query.status)) {
    errors.push(`status must be one of: ${TASK_STATUSES.join(", ")}`);
  } else if (query.status) {
    clean.status = query.status;
  }

  if (
    query.category !== undefined &&
    query.category !== "" &&
    !TASK_CATEGORIES.includes(query.category)
  ) {
    errors.push(`category must be one of: ${TASK_CATEGORIES.join(", ")}`);
  } else if (query.category) {
    clean.category = query.category;
  }

  if (
    query.priority !== undefined &&
    query.priority !== "" &&
    !TASK_PRIORITIES.includes(query.priority)
  ) {
    errors.push(`priority must be one of: ${TASK_PRIORITIES.join(", ")}`);
  } else if (query.priority) {
    clean.priority = query.priority;
  }

  if (query.search !== undefined) {
    clean.search = String(query.search || "").trim();
  }

  if (query.archived !== undefined && query.archived !== "") {
    if (!["true", "false"].includes(String(query.archived))) {
      errors.push("archived must be true or false");
    } else {
      clean.archived = String(query.archived) === "true";
    }
  }

  if (query.due !== undefined && query.due !== "") {
    const due = String(query.due);
    if (!["overdue", "today", "upcoming", "none"].includes(due)) {
      errors.push("due must be one of: overdue, today, upcoming, none");
    } else {
      clean.due = due;
    }
  }

  if (query.sortBy !== undefined && query.sortBy !== "") {
    if (!TASK_SORT_FIELDS.includes(String(query.sortBy))) {
      errors.push(`sortBy must be one of: ${TASK_SORT_FIELDS.join(", ")}`);
    } else {
      clean.sortBy = String(query.sortBy);
    }
  }

  if (query.sortDir !== undefined && query.sortDir !== "") {
    const dir = String(query.sortDir).toLowerCase();
    if (!["asc", "desc"].includes(dir)) {
      errors.push("sortDir must be asc or desc");
    } else {
      clean.sortDir = dir;
    }
  }

  if (query.limit !== undefined && query.limit !== "") {
    const limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      errors.push("limit must be an integer between 1 and 200");
    } else {
      clean.limit = limit;
    }
  }

  if (query.offset !== undefined && query.offset !== "") {
    const offset = Number(query.offset);
    if (!Number.isInteger(offset) || offset < 0) {
      errors.push("offset must be an integer greater than or equal to 0");
    } else {
      clean.offset = offset;
    }
  }

  return { errors, clean };
}

function validateBulkStatusInput(payload) {
  const errors = [];
  const clean = {};

  if (!Array.isArray(payload.taskIds) || payload.taskIds.length === 0) {
    errors.push("taskIds must be a non-empty array");
  } else {
    const normalized = payload.taskIds
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter(Boolean);
    if (normalized.length !== payload.taskIds.length) {
      errors.push("taskIds must contain valid non-empty string IDs");
    } else {
      clean.taskIds = Array.from(new Set(normalized));
    }
  }

  if (!TASK_STATUSES.includes(payload.status)) {
    errors.push(`status must be one of: ${TASK_STATUSES.join(", ")}`);
  } else {
    clean.status = payload.status;
  }

  return { errors, clean };
}

function validateAuthInput(payload) {
  const errors = [];
  const clean = {};

  if (!isNonEmptyString(payload?.name)) {
    errors.push("name is required");
  } else if (payload.name.trim().length < 2 || payload.name.trim().length > 80) {
    errors.push("name must be between 2 and 80 characters");
  } else {
    clean.name = payload.name.trim();
  }

  if (!isNonEmptyString(payload?.email)) {
    errors.push("valid email is required");
  } else {
    const normalizedEmail = payload.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      errors.push("valid email is required");
    } else {
      clean.email = normalizedEmail;
    }
  }

  if (!isNonEmptyString(payload?.password)) {
    errors.push("password is required");
  } else if (payload.password.length < env.auth.passwordMinLength) {
    errors.push(`password must be at least ${env.auth.passwordMinLength} characters`);
  } else {
    if (env.isProductionMode) {
      if (!/[a-z]/.test(payload.password)) {
        errors.push("password must include a lowercase letter");
      }
      if (!/[A-Z]/.test(payload.password)) {
        errors.push("password must include an uppercase letter");
      }
      if (!/[0-9]/.test(payload.password)) {
        errors.push("password must include a number");
      }
      if (!/[^a-zA-Z0-9]/.test(payload.password)) {
        errors.push("password must include a symbol");
      }
    }
    clean.password = payload.password;
  }

  return { errors, clean };
}

function validateLoginInput(payload) {
  const errors = [];
  const clean = {};

  if (!isNonEmptyString(payload?.email)) {
    errors.push("email is required");
  } else {
    clean.email = payload.email.trim().toLowerCase();
  }

  if (!isNonEmptyString(payload?.password)) {
    errors.push("password is required");
  } else {
    clean.password = payload.password;
  }

  return { errors, clean };
}

function validateEmailVerificationInput(payload) {
  const errors = [];
  const clean = {};

  if (!isNonEmptyString(payload?.email)) {
    errors.push("email is required");
  } else {
    clean.email = payload.email.trim().toLowerCase();
  }

  if (!isNonEmptyString(payload?.token)) {
    errors.push("verification token is required");
  } else if (payload.token.trim().length < 20) {
    errors.push("verification token is invalid");
  } else {
    clean.token = payload.token.trim();
  }

  return { errors, clean };
}

module.exports = {
  validateTaskInput,
  validateTaskQuery,
  validateBulkStatusInput,
  validateLoginInput,
  validateEmailVerificationInput,
  validateAuthInput,
};
