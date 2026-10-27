import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAutosave,
  type AutosaveStatus,
  type SaveOutcome,
} from "../src/autosave";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(outcomes: SaveOutcome[] = [], { enabled = true } = {}) {
  const statuses: AutosaveStatus["kind"][] = [];
  const calls: { autosave: boolean; keepalive: boolean }[] = [];
  let release: (() => void) | undefined;
  const state = { hold: false };
  const save = vi.fn(
    async (options: { autosave: boolean; keepalive: boolean }) => {
      calls.push(options);
      if (state.hold) await new Promise<void>((resolve) => (release = resolve));
      return outcomes.shift() ?? { kind: "saved" as const };
    },
  );
  const autosave = createAutosave({
    save,
    enabled: () => enabled,
    onStatus: (status) => statuses.push(status.kind),
    now: () => new Date(Date.now()),
  });
  return { autosave, save, calls, statuses, state, release: () => release?.() };
}

describe("autosave", () => {
  it("saves two seconds after the writer pauses", async () => {
    const { autosave, save, statuses } = setup();
    autosave.changed();
    await vi.advanceTimersByTimeAsync(1000);
    autosave.changed();
    await vi.advanceTimersByTimeAsync(1999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe("saved");
    expect(autosave.hasUnsaved()).toBe(false);
  });

  it("saves at least every eight seconds while the writer keeps typing", async () => {
    const { autosave, save } = setup();
    for (let n = 0; n < 9; n += 1) {
      autosave.changed();
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves changes made during a save after it, one save at a time", async () => {
    const { autosave, save, state, release } = setup();
    state.hold = true;
    autosave.changed();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
    autosave.changed();
    await vi.advanceTimersByTimeAsync(5000);
    // Still waiting for the first one.
    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.hasUnsaved()).toBe(true);
    state.hold = false;
    release();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(autosave.hasUnsaved()).toBe(false);
  });

  it("stops on a conflict until the writer chooses a version", async () => {
    const { autosave, save, statuses } = setup([{ kind: "conflict" }]);
    autosave.changed();
    await vi.advanceTimersByTimeAsync(2000);
    expect(statuses.at(-1)).toBe("conflict");
    autosave.changed();
    await vi.advanceTimersByTimeAsync(20_000);
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.hasUnsaved()).toBe(true);

    // Keeping their own version is a save they chose.
    expect(await autosave.saveNow()).toEqual({ kind: "saved" });
    expect(save).toHaveBeenLastCalledWith({
      autosave: false,
      keepalive: false,
    });
    autosave.changed();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("starts clean after the writer loads the other version", async () => {
    const { autosave, statuses } = setup([{ kind: "conflict" }]);
    autosave.changed();
    await vi.advanceTimersByTimeAsync(2000);
    autosave.reset();
    expect(autosave.hasUnsaved()).toBe(false);
    expect(statuses.at(-1)).toBe("clean");
  });

  it("retries after a connection failure, not after a refusal", async () => {
    const { autosave, save, statuses } = setup([
      { kind: "failed", error: "Offline", retry: true },
      { kind: "failed", error: "Another post uses this slug", retry: false },
    ]);
    autosave.changed();
    await vi.advanceTimersByTimeAsync(2000);
    expect(statuses.at(-1)).toBe("failed");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(2);
    // The next change tries again.
    autosave.changed();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("flushes pending changes at once, with keepalive when the tab closes", async () => {
    const { autosave, calls } = setup();
    autosave.changed();
    await autosave.flush({ keepalive: true });
    expect(calls).toEqual([{ autosave: true, keepalive: true }]);
    await autosave.flush();
    expect(calls).toHaveLength(1);
  });

  it("only tracks changes when autosave is off", async () => {
    const { autosave, save } = setup([], { enabled: false });
    autosave.changed();
    await vi.advanceTimersByTimeAsync(20_000);
    await autosave.flush();
    expect(save).not.toHaveBeenCalled();
    expect(autosave.hasUnsaved()).toBe(true);
    await autosave.saveNow();
    expect(autosave.hasUnsaved()).toBe(false);
  });
});
