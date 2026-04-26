const express = require("express");
const taskController = require("../controllers/taskController");

function createTaskRoutes(taskRepository) {
  const router = express.Router();
  const controller = taskController(taskRepository);

  router.get("/insights", controller.insights);
  router.patch("/bulk/status", controller.bulkStatusUpdate);
  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.post("/", controller.create);
  router.patch("/:id", controller.update);
  router.delete("/:id", controller.remove);

  return router;
}

module.exports = createTaskRoutes;
