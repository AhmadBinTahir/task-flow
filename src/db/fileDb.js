const fs = require("fs/promises");
const path = require("path");

class FileDb {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async ensureReady() {
    const absolutePath = path.resolve(this.filePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });

    try {
      await fs.access(absolutePath);
    } catch {
      const initial = { users: [], tasks: [] };
      await fs.writeFile(absolutePath, JSON.stringify(initial, null, 2), "utf8");
    }
  }

  async read() {
    await this.ensureReady();
    const raw = await fs.readFile(path.resolve(this.filePath), "utf8");
    const parsed = JSON.parse(raw || "{}");
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  }

  async write(data) {
    await this.ensureReady();
    const absolutePath = path.resolve(this.filePath);
    const tempPath = `${absolutePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tempPath, absolutePath);
  }

  async mutate(mutator) {
    this.writeQueue = this.writeQueue.then(async () => {
      const data = await this.read();
      const clone = structuredClone(data);
      const next = await mutator(clone);
      if (!next || typeof next !== "object") {
        throw new Error("Mutator must return the updated data object");
      }
      await this.write(next);
      return next;
    });

    return this.writeQueue;
  }
}

module.exports = FileDb;
