export type SaveOutcome =
  | { kind: "saved" }
  /** Someone saved since this version was loaded; nothing was written. */
  | { kind: "conflict" }
  | { kind: "failed"; error: string; retry: boolean };

export type AutosaveStatus =
  | { kind: "clean" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "failed"; error: string; retrying: boolean }
  | { kind: "conflict" };

export interface AutosaveOptions {
  /** Saves the form as it is now. */
  save: (options: {
    autosave: boolean;
    keepalive: boolean;
  }) => Promise<SaveOutcome>;
  /** Whether changes save by themselves (not for a published post). */
  enabled: () => boolean;
  onStatus: (status: AutosaveStatus) => void;
  now?: () => Date;
  /** Quiet time after the last change before saving. */
  delayMs?: number;
  /** Longest a change waits while the writer keeps typing. */
  maxWaitMs?: number;
  /** Wait before trying again after a connection or server failure. */
  retryMs?: number;
}

export interface Autosave {
  /** The form changed. */
  changed(): void;
  /** A save the writer chose; waits for any autosave in flight first. */
  saveNow(): Promise<SaveOutcome>;
  /** Saves pending changes right away, e.g. when the tab is hidden or closed. */
  flush(options?: { keepalive?: boolean }): Promise<void>;
  /** True while changes aren't on the server yet. */
  hasUnsaved(): boolean;
  /** The writer loaded the current version after a conflict: nothing is unsaved. */
  reset(): void;
  dispose(): void;
}

/**
 * Saves the form a couple of seconds after the writer pauses, and at least
 * every few seconds while they keep typing. One save runs at a time; changes
 * made during a save are saved after it. A conflict stops autosaving until the
 * writer chooses whose version to keep, so nothing is overwritten silently.
 */
export function createAutosave({
  save,
  enabled,
  onStatus,
  now = () => new Date(),
  delayMs = 2000,
  maxWaitMs = 8000,
  retryMs = 10_000,
}: AutosaveOptions): Autosave {
  let dirty = false;
  let blocked = false;
  let disposed = false;
  let running = 0;
  let firstChange: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  const status = (next: AutosaveStatus) => {
    if (!disposed) onStatus(next);
  };

  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  const schedule = (wait: number) => {
    clearTimer();
    timer = setTimeout(
      () => void run({ autosave: true, keepalive: false }),
      wait,
    );
  };

  const scheduleAfterChange = () => {
    const at = now().getTime();
    firstChange ??= at;
    schedule(Math.max(0, Math.min(delayMs, firstChange + maxWaitMs - at)));
  };

  /** Queues a save, so saves never overlap. */
  const run = (options: { autosave: boolean; keepalive: boolean }) => {
    running += 1;
    const task = queue.then(() => attempt(options));
    queue = task.catch(() => undefined);
    return task.finally(() => {
      running -= 1;
    });
  };

  const attempt = async ({
    autosave,
    keepalive,
  }: {
    autosave: boolean;
    keepalive: boolean;
  }): Promise<SaveOutcome> => {
    // An autosave queued behind a save that already sent everything has nothing to do.
    if (autosave && (!dirty || blocked || disposed || !enabled())) {
      return { kind: "saved" };
    }
    clearTimer();
    dirty = false;
    firstChange = null;
    status({ kind: "saving" });
    const outcome = await save({ autosave, keepalive });
    if (outcome.kind === "saved") {
      if (dirty && enabled() && !blocked) {
        status({ kind: "pending" });
        scheduleAfterChange();
      } else if (dirty) {
        status({ kind: "pending" });
      } else {
        status({ kind: "saved", at: now() });
      }
    } else if (outcome.kind === "conflict") {
      dirty = true;
      blocked = true;
      clearTimer();
      status({ kind: "conflict" });
    } else {
      dirty = true;
      const retrying = autosave && outcome.retry && enabled();
      // A chosen save shows its own message next to the buttons.
      status(
        autosave
          ? { kind: "failed", error: outcome.error, retrying }
          : { kind: "pending" },
      );
      if (retrying && !disposed) schedule(retryMs);
    }
    return outcome;
  };

  return {
    changed() {
      dirty = true;
      if (blocked) return;
      status({ kind: "pending" });
      if (enabled()) scheduleAfterChange();
    },
    saveNow() {
      blocked = false;
      clearTimer();
      return run({ autosave: false, keepalive: false });
    },
    async flush({ keepalive = false } = {}) {
      if (!dirty || blocked || !enabled()) return;
      await run({ autosave: true, keepalive });
    },
    hasUnsaved: () => dirty || running > 0,
    reset() {
      blocked = false;
      dirty = false;
      firstChange = null;
      clearTimer();
      status({ kind: "clean" });
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
