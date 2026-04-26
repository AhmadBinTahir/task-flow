const HttpError = require("../utils/httpError");
const {
  validateTaskInput,
  validateTaskQuery,
  validateBulkStatusInput,
} = require("../utils/validators");

function taskController(taskRepository) {
  return {
    list: async (req, res, next) => {
      try {
        const { errors, clean } = validateTaskQuery(req.query);
        if (errors.length > 0) {
          throw new HttpError(400, "Invalid query parameters", errors);
        }

        const result = await taskRepository.listByUserId(req.user.id, clean);
        res.json({ success: true, tasks: result.tasks, total: result.total });
      } catch (error) {
        next(error);
      }
    },

    getById: async (req, res, next) => {
      try {
        const task = await taskRepository.findByIdForUser(req.params.id, req.user.id);
        if (!task) {
          throw new HttpError(404, "Task not found");
        }
        res.json({ success: true, task });
      } catch (error) {
        next(error);
      }
    },

    create: async (req, res, next) => {
      try {
        const { errors, clean } = validateTaskInput(req.body);
        if (errors.length > 0) {
          throw new HttpError(400, "Validation failed", errors);
        }

        const task = await taskRepository.create(req.user.id, clean);
        res.status(201).json({ success: true, task });
      } catch (error) {
        next(error);
      }
    },

    update: async (req, res, next) => {
      try {
        const { errors, clean } = validateTaskInput(req.body, { partial: true });
        if (errors.length > 0) {
          throw new HttpError(400, "Validation failed", errors);
        }
        if (Object.keys(clean).length === 0) {
          throw new HttpError(400, "At least one updatable field is required");
        }

        const updated = await taskRepository.update(req.user.id, req.params.id, clean);
        if (!updated) {
          throw new HttpError(404, "Task not found");
        }
        res.json({ success: true, task: updated });
      } catch (error) {
        next(error);
      }
    },

    remove: async (req, res, next) => {
      try {
        const removed = await taskRepository.delete(req.user.id, req.params.id);
        if (!removed) {
          throw new HttpError(404, "Task not found");
        }
        res.json({ success: true, message: "Task deleted" });
      } catch (error) {
        next(error);
      }
    },

    bulkStatusUpdate: async (req, res, next) => {
      try {
        const { errors, clean } = validateBulkStatusInput(req.body || {});
        if (errors.length > 0) {
          throw new HttpError(400, "Validation failed", errors);
        }
        const updatedCount = await taskRepository.bulkUpdateStatus(
          req.user.id,
          clean.taskIds,
          clean.status
        );
        res.json({ success: true, updatedCount });
      } catch (error) {
        next(error);
      }
    },

    insights: async (req, res, next) => {
      try {
        const insights = await taskRepository.getInsights(req.user.id);
        res.json({ success: true, insights });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = taskController;
