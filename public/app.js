const API_BASE = "/api";
let authMode = "login";
let authToken = localStorage.getItem("taskflow_token") || "";
let currentUser = null;
let tasks = [];
let selectedTaskIds = new Set();
let activeView = localStorage.getItem("taskflow_view") || "list";
let authConfig = {
  mode: "development",
  requiresEmailVerification: false,
  passwordMinLength: 8,
};

const authView = document.getElementById("auth-view");
const dashboardView = document.getElementById("dashboard-view");
const authForm = document.getElementById("auth-form");
const nameGroup = document.getElementById("name-group");
const authSubmit = document.getElementById("auth-submit");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const welcomeText = document.getElementById("welcome-text");
const tasksGrid = document.getElementById("tasks-grid");
const tasksEmpty = document.getElementById("tasks-empty");
const taskModal = document.getElementById("task-modal");
const taskForm = document.getElementById("task-form");
const modalTitle = document.getElementById("modal-title");
const toast = document.getElementById("toast");
const listWrap = document.getElementById("list-wrap");
const boardWrap = document.getElementById("board-wrap");
const listViewBtn = document.getElementById("view-list-btn");
const boardViewBtn = document.getElementById("view-board-btn");
const verificationPanel = document.getElementById("verification-panel");
const verificationMessage = document.getElementById("verification-message");
const verificationTokenInput = document.getElementById("verification-token");

async function runAction(action) {
  try {
    await action();
  } catch (error) {
    showToast(error.message);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2500);
}

function toApiError(body, fallback = "Request failed") {
  if (body?.details?.length) {
    return `${body.message}: ${body.details.join(", ")}`;
  }
  return body?.message || fallback;
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toApiError(body));
  }
  return body;
}

function switchAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === "register";
  nameGroup.classList.toggle("hidden", !isRegister);
  authSubmit.textContent = isRegister ? "Create account" : "Login";
  tabLogin.classList.toggle("active", !isRegister);
  tabRegister.classList.toggle("active", isRegister);
  verificationPanel.classList.add("hidden");
}

function setSession(token, user) {
  authToken = token;
  currentUser = user;
  localStorage.setItem("taskflow_token", token);
}

function clearSession() {
  authToken = "";
  currentUser = null;
  localStorage.removeItem("taskflow_token");
}

function updateMainView() {
  const loggedIn = Boolean(authToken && currentUser);
  authView.classList.toggle("hidden", loggedIn);
  dashboardView.classList.toggle("hidden", !loggedIn);
  welcomeText.textContent = loggedIn ? `Welcome, ${currentUser.name}` : "";
}

function setVerificationState(message, showPanel = true) {
  verificationMessage.textContent = message;
  verificationPanel.classList.toggle("hidden", !showPanel);
}

function setWorkspaceView(view) {
  activeView = view;
  localStorage.setItem("taskflow_view", view);
  const isList = view === "list";
  listWrap.classList.toggle("hidden", !isList);
  boardWrap.classList.toggle("hidden", isList);
  listViewBtn.classList.toggle("active", isList);
  boardViewBtn.classList.toggle("active", !isList);
}

function toLocalDateInput(isoDate) {
  if (!isoDate) {
    return "";
  }
  const date = new Date(isoDate);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDateInput(localDateTime) {
  if (!localDateTime) {
    return null;
  }
  return new Date(localDateTime).toISOString();
}

function taskMetaChips(task) {
  const recurrenceChip =
    task.recurrence && task.recurrence !== "none"
      ? `<span class="chip tag">repeats ${task.recurrence}</span>`
      : "";

  return `
    <span class="chip category-${task.category}">${task.category}</span>
    <span class="chip status-${task.status}">${task.status}</span>
    <span class="chip priority-${task.priority}">${task.priority}</span>
    ${recurrenceChip}
  `;
}

function taskTagsMarkup(tags = []) {
  if (!tags.length) {
    return "";
  }
  return `<div class="tag-wrap">${tags.map((tag) => `<span class="chip tag">${tag}</span>`).join("")}</div>`;
}

function taskCardTemplate(task) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";
  return `
    <div class="task-top">
      <label class="checkbox-inline">
        <input type="checkbox" data-select-task="${task.id}" ${selectedTaskIds.has(task.id) ? "checked" : ""}/>
        <h4>${task.title}</h4>
      </label>
      ${task.archived ? '<span class="chip tag">archived</span>' : ""}
    </div>
    <div class="task-meta">${taskMetaChips(task)}</div>
    ${task.description ? `<p>${task.description}</p>` : '<p class="muted">No description</p>'}
    ${taskTagsMarkup(task.tags)}
    ${task.recurrenceEndDate ? `<small class="muted">Repeats until ${new Date(task.recurrenceEndDate).toLocaleString()}</small>` : ""}
    <small class="${isOverdue ? "chip priority-critical" : "muted"}">
      ${task.dueDate ? `Due ${new Date(task.dueDate).toLocaleString()}` : "No due date"}
    </small>
    <div class="task-actions">
      <button class="btn btn-ghost" data-edit-task="${task.id}" type="button">Edit</button>
      <button class="btn btn-ghost" data-done-task="${task.id}" type="button">Done</button>
      <button class="btn btn-ghost" data-archive-task="${task.id}" type="button">
        ${task.archived ? "Unarchive" : "Archive"}
      </button>
      <button class="btn btn-danger" data-delete-task="${task.id}" type="button">Delete</button>
    </div>
  `;
}

function attachTaskEvents(container) {
  container.querySelectorAll("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = tasks.find((item) => item.id === button.dataset.editTask);
      openTaskModal(task || null);
    });
  });

  container.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", () =>
      runAction(async () => {
        if (!confirm("Delete this task?")) {
          return;
        }
        await api(`/tasks/${button.dataset.deleteTask}`, { method: "DELETE" });
        showToast("Task deleted");
        await loadTasksAndInsights();
      })
    );
  });

  container.querySelectorAll("[data-done-task]").forEach((button) => {
    button.addEventListener("click", () =>
      runAction(async () => {
        await api(`/tasks/${button.dataset.doneTask}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "done" }),
        });
        showToast("Task marked done");
        await loadTasksAndInsights();
      })
    );
  });

  container.querySelectorAll("[data-archive-task]").forEach((button) => {
    button.addEventListener("click", () =>
      runAction(async () => {
        const task = tasks.find((item) => item.id === button.dataset.archiveTask);
        if (!task) {
          return;
        }
        await api(`/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ archived: !task.archived }),
        });
        showToast(task.archived ? "Task restored" : "Task archived");
        await loadTasksAndInsights();
      })
    );
  });

  container.querySelectorAll("[data-select-task]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const id = checkbox.dataset.selectTask;
      if (checkbox.checked) {
        selectedTaskIds.add(id);
      } else {
        selectedTaskIds.delete(id);
      }
    });
  });
}

function renderList() {
  tasksGrid.innerHTML = "";
  tasksEmpty.classList.toggle("hidden", tasks.length > 0);

  tasks.forEach((task) => {
    const card = document.createElement("article");
    card.className = "task-card";
    card.innerHTML = taskCardTemplate(task);
    tasksGrid.appendChild(card);
    attachTaskEvents(card);
  });
}

function renderBoard() {
  const columns = {
    pending: document.getElementById("kanban-pending"),
    "in-progress": document.getElementById("kanban-in-progress"),
    done: document.getElementById("kanban-done"),
  };
  Object.values(columns).forEach((column) => {
    column.innerHTML = "";
  });

  tasks.forEach((task) => {
    const card = document.createElement("article");
    card.className = "task-card";
    card.innerHTML = taskCardTemplate(task);
    columns[task.status].appendChild(card);
    attachTaskEvents(card);
  });
}

function updateInsights(insights) {
  document.getElementById("stat-total").textContent = insights.total;
  document.getElementById("stat-completed").textContent = insights.completed;
  document.getElementById("stat-overdue").textContent = insights.overdue;
  document.getElementById("stat-rate").textContent = `${insights.completionRate}%`;
}

function getFilters() {
  return {
    search: document.getElementById("filter-search").value.trim(),
    status: document.getElementById("filter-status").value,
    category: document.getElementById("filter-category").value,
    priority: document.getElementById("filter-priority").value,
    due: document.getElementById("filter-due").value,
    sortBy: document.getElementById("filter-sort-by").value,
    sortDir: document.getElementById("filter-sort-dir").value,
    archived: document.getElementById("filter-archived").checked ? "true" : "",
  };
}

async function loadTasks() {
  const filters = getFilters();
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== "") {
      query.set(key, value);
    }
  });
  const data = await api(`/tasks?${query.toString()}`);
  tasks = data.tasks;
  renderList();
  renderBoard();
}

async function loadInsights() {
  const data = await api("/tasks/insights");
  updateInsights(data.insights);
}

async function loadTasksAndInsights() {
  await Promise.all([loadTasks(), loadInsights()]);
}

function openTaskModal(task = null) {
  taskForm.reset();
  document.getElementById("task-id").value = task?.id || "";
  document.getElementById("task-title").value = task?.title || "";
  document.getElementById("task-description").value = task?.description || "";
  document.getElementById("task-category").value = task?.category || "work";
  document.getElementById("task-status").value = task?.status || "pending";
  document.getElementById("task-priority").value = task?.priority || "medium";
  document.getElementById("task-due-date").value = toLocalDateInput(task?.dueDate || null);
  document.getElementById("task-recurrence").value = task?.recurrence || "none";
  document.getElementById("task-recurrence-end-date").value = toLocalDateInput(
    task?.recurrenceEndDate || null
  );
  document.getElementById("task-tags").value = (task?.tags || []).join(", ");
  document.getElementById("task-archived").checked = Boolean(task?.archived);
  modalTitle.textContent = task ? "Update Task" : "Create Task";
  syncRecurrenceEndDateState();
  taskModal.showModal();
}

function closeTaskModal() {
  taskModal.close();
}

function syncRecurrenceEndDateState() {
  const recurrence = document.getElementById("task-recurrence").value;
  const recurrenceEndDateInput = document.getElementById("task-recurrence-end-date");
  const disabled = recurrence === "none";
  recurrenceEndDateInput.disabled = disabled;
  if (disabled) {
    recurrenceEndDateInput.value = "";
  }
}

tabLogin.addEventListener("click", () => switchAuthMode("login"));
tabRegister.addEventListener("click", () => switchAuthMode("register"));
listViewBtn.addEventListener("click", () => setWorkspaceView("list"));
boardViewBtn.addEventListener("click", () => setWorkspaceView("board"));

authForm.addEventListener("submit", (event) =>
  runAction(async () => {
    event.preventDefault();
    const payload = {
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value,
    };
    if (authMode === "register") {
      payload.name = document.getElementById("name").value.trim();
    }
    const endpoint = authMode === "register" ? "/auth/register" : "/auth/login";
    const data = await api(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (authMode === "register" && data.requiresEmailVerification) {
      const passwordHint = authConfig.mode === "production"
        ? "Production mode requires verified email before login."
        : "Use the token below to verify instantly in dev mode.";
      if (data.verificationToken) {
        verificationTokenInput.value = data.verificationToken;
      }
      setVerificationState(`Account created. ${passwordHint}`);
      showToast("Verification required");
      return;
    }

    setSession(data.token, data.user);
    updateMainView();
    setWorkspaceView(activeView);
    await loadTasksAndInsights();
    showToast(authMode === "register" ? "Account created" : "Welcome back");
  })
);

document.getElementById("verify-email-btn").addEventListener("click", () =>
  runAction(async () => {
    const email = document.getElementById("email").value.trim();
    const token = verificationTokenInput.value.trim();
    const data = await api("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ email, token }),
    });
    if (data.verified) {
      setVerificationState("Email verified. You can now login.", false);
      switchAuthMode("login");
      showToast("Email verified");
    }
  })
);

document.getElementById("resend-verification-btn").addEventListener("click", () =>
  runAction(async () => {
    const email = document.getElementById("email").value.trim();
    const data = await api("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    if (data.verificationToken) {
      verificationTokenInput.value = data.verificationToken;
    }
    showToast("Verification sent");
  })
);

document.getElementById("logout-btn").addEventListener("click", () => {
  clearSession();
  selectedTaskIds = new Set();
  updateMainView();
});

document.getElementById("new-task-btn").addEventListener("click", () => openTaskModal());
document.getElementById("task-cancel").addEventListener("click", closeTaskModal);
document.getElementById("task-recurrence").addEventListener("change", syncRecurrenceEndDateState);

taskForm.addEventListener("submit", (event) =>
  runAction(async () => {
    event.preventDefault();
    const taskId = document.getElementById("task-id").value;
    const tags = document
      .getElementById("task-tags")
      .value.split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const payload = {
      title: document.getElementById("task-title").value.trim(),
      description: document.getElementById("task-description").value.trim(),
      category: document.getElementById("task-category").value,
      status: document.getElementById("task-status").value,
      priority: document.getElementById("task-priority").value,
      dueDate: fromLocalDateInput(document.getElementById("task-due-date").value),
      recurrence: document.getElementById("task-recurrence").value,
      recurrenceEndDate: fromLocalDateInput(document.getElementById("task-recurrence-end-date").value),
      tags,
      archived: document.getElementById("task-archived").checked,
    };

    if (payload.recurrence === "none") {
      payload.recurrenceEndDate = null;
    }

    if (taskId) {
      await api(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) });
      showToast("Task updated");
    } else {
      await api("/tasks", { method: "POST", body: JSON.stringify(payload) });
      showToast("Task created");
    }
    closeTaskModal();
    await loadTasksAndInsights();
  })
);

document.getElementById("mark-selected-done-btn").addEventListener("click", () =>
  runAction(async () => {
    if (selectedTaskIds.size === 0) {
      showToast("Select at least one task");
      return;
    }
    await api("/tasks/bulk/status", {
      method: "PATCH",
      body: JSON.stringify({ taskIds: Array.from(selectedTaskIds), status: "done" }),
    });
    selectedTaskIds = new Set();
    showToast("Selected tasks marked done");
    await loadTasksAndInsights();
  })
);

[
  "filter-status",
  "filter-category",
  "filter-priority",
  "filter-due",
  "filter-sort-by",
  "filter-sort-dir",
  "filter-archived",
].forEach((id) => {
  document.getElementById(id).addEventListener("change", loadTasks);
});

document.getElementById("filter-search").addEventListener("input", () => {
  clearTimeout(window.__taskSearchDebounce);
  window.__taskSearchDebounce = setTimeout(loadTasks, 260);
});

async function boot() {
  const cfg = await api("/auth/config");
  authConfig = cfg.auth;
  document.getElementById("password").minLength = authConfig.passwordMinLength;

  let prefillVerification = false;
  const urlParams = new URLSearchParams(window.location.search);
  const verifyEmail = urlParams.get("verify_email");
  const verifyToken = urlParams.get("verify_token");
  if (verifyEmail && verifyToken) {
    document.getElementById("email").value = verifyEmail;
    verificationTokenInput.value = verifyToken;
    prefillVerification = true;
  }

  switchAuthMode(prefillVerification ? "register" : "login");
  syncRecurrenceEndDateState();
  if (prefillVerification) {
    setVerificationState("Verification link detected. Click verify email.");
  }
  setWorkspaceView(activeView);
  if (!authToken) {
    updateMainView();
    return;
  }

  try {
    const me = await api("/auth/me");
    currentUser = me.user;
    updateMainView();
    await loadTasksAndInsights();
  } catch {
    clearSession();
    updateMainView();
  }
}

boot().catch((error) => {
  showToast(error.message);
});
