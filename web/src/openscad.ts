// A pool of OpenSCAD workers. Jobs run in parallel, one for each worker.

import type { Job, JobResult } from "./openscad.worker";
import OpenScadWorker from "./openscad.worker?worker";

export class ModelError extends Error {}

export class Pool {
  private idle: Worker[] = [];
  private queue: { job: Job; resolve: (r: JobResult) => void }[] = [];
  private pending = new Map<number, (r: JobResult) => void>();
  private nextId = 1;

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      const worker = new OpenScadWorker();
      worker.onmessage = (event: MessageEvent<JobResult>) => {
        this.pending.get(event.data.id)?.(event.data);
        this.pending.delete(event.data.id);
        this.idle.push(worker);
        this.next();
      };
      this.idle.push(worker);
    }
  }

  run(job: Omit<Job, "id">): Promise<JobResult> {
    return new Promise((resolve) => {
      this.queue.push({ job: { ...job, id: this.nextId++ }, resolve });
      this.next();
    });
  }

  private next() {
    while (this.idle.length && this.queue.length) {
      const worker = this.idle.pop()!;
      const { job, resolve } = this.queue.shift()!;
      this.pending.set(job.id, resolve);
      worker.postMessage(job);
    }
  }
}

/** The pool for the page: one worker for each core, from 2 to 8. */
export const pool = new Pool(Math.max(2, Math.min(8, navigator.hardwareConcurrency || 4)));

/** Run a job. Throw ModelError with the first assertion message if OpenSCAD fails. */
export async function render(pool: Pool, job: Omit<Job, "id">): Promise<JobResult & { data: Uint8Array }> {
  const result = await pool.run(job);
  // For an echo file, OpenSCAD writes the assertion messages into the file
  const text = job.output === "echo" && result.data ? result.log + new TextDecoder().decode(result.data) : result.log;
  const failed = /ERROR: Assertion .*? failed: "(.*?)"/.exec(text);
  if (failed) throw new ModelError(failed[1].charAt(0).toUpperCase() + failed[1].slice(1));
  if (!result.ok || !result.data) throw new ModelError(result.log.trim() || "OpenSCAD failed");
  return result as JobResult & { data: Uint8Array };
}
