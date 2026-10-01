import { describe, expect, test } from "vitest";
import { KeeperControl } from "./keeper-control.js";
import type { ReceiptOutcome } from "./send-receipts.js";

const request = {
  requestId: "r",
  agentId: "a",
  text: "hi",
  idempotencyKey: "k",
  expectedSessionIncarnation: "i",
  expectedPermissionGeneration: 0,
  onActiveTurn: "reject",
} as never;

function build(options: { reserve: ReceiptOutcome; releaseFails?: boolean; writeError?: Error }) {
  const calls = { released: 0, committed: 0 };
  const manager = {
    getAgent: () => ({}),
    admitGuarded: async (_id: string, guard: { reserve: () => Promise<{ ok: boolean }> }) => {
      const reserved = await guard.reserve();
      if (!reserved.ok) return { rejected: (reserved as { reason: string }).reason, state: null };
      calls.committed += 1;
      return { admitted: true, value: "turn_started" };
    },
    getControlState: () => null,
  };
  const receipts = {
    serialize: (_a: string, _k: string, op: () => Promise<unknown>) => op(),
    lookup: async () => ({ kind: "none" }),
    reserve: async () => options.reserve,
    complete: async () => undefined,
    release: async () => {
      calls.released += 1;
      if (options.releaseFails) throw new Error("rm failed");
    },
  };
  const outbox = { lastWriteError: () => options.writeError ?? null };
  const control = new KeeperControl({
    enabled: true,
    agentManager: manager,
    agentStorage: { get: async () => ({ archivedAt: null }) },
    receipts,
    outbox,
    logger: { error: () => undefined },
  } as never);
  return { control, calls };
}

describe("keeper control guards", () => {
  test("a receipt that appears at reserve time blocks the send and is not released", async () => {
    const { control, calls } = build({ reserve: { kind: "outcome_unknown" } });
    expect(await control.send(request)).toMatchObject({ result: "outcome_unknown" });
    expect(calls).toEqual({ released: 0, committed: 0 });
  });

  test("a completed receipt that appears at reserve time answers duplicate", async () => {
    const { control, calls } = build({ reserve: { kind: "duplicate", delivery: "steered" } });
    expect(await control.send(request)).toMatchObject({ result: "duplicate", delivery: "steered" });
    expect(calls.committed).toBe(0);
  });

  test("a failed receipt release cannot turn a rejection into an error", async () => {
    const { control } = build({ reserve: { kind: "none" }, releaseFails: true });
    const internal = control as unknown as {
      releaseReceipt: (req: unknown) => Promise<void>;
    };
    await expect(internal.releaseReceipt(request)).resolves.toBeUndefined();
  });

  test("a latched outbox write error is reported by the feed", () => {
    const { control } = build({ reserve: { kind: "none" }, writeError: new Error("ENOSPC") });
    expect(control.feedError()).toBe("event feed stalled: ENOSPC");
    expect(build({ reserve: { kind: "none" } }).control.feedError()).toBeNull();
  });
});
