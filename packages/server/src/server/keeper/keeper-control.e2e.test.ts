import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createDaemonTestContext, type DaemonTestContext } from "../test-utils/index.js";
import { ControllableAgentClient } from "../test-utils/controllable-agent-client.js";
import { KeeperSendReceipts, sendFingerprint } from "./send-receipts.js";

interface Harness {
  ctx: DaemonTestContext;
  provider: ControllableAgentClient;
  agentId: string;
}

let harness: Harness | null = null;

async function setup(keeperControlEnabled = true): Promise<Harness> {
  const provider = new ControllableAgentClient("codex");
  const ctx = await createDaemonTestContext({
    agentClients: { codex: provider },
    keeperControlEnabled,
  });
  const cwd = mkdtempSync(path.join(tmpdir(), "keeper-e2e-"));
  const agent = await ctx.client.createAgent({ provider: "codex", cwd, title: "keeper" });
  harness = { ctx, provider, agentId: agent.id };
  return harness;
}

afterEach(async () => {
  await harness?.ctx.cleanup();
  harness = null;
}, 60_000);

async function until(check: () => boolean | Promise<boolean>, what: string): Promise<void> {
  for (let i = 0; i < 400; i += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function observe(h: Harness) {
  const { snapshot } = await h.ctx.client.keeperGetSnapshot(h.agentId);
  if (!snapshot?.sessionIncarnation) throw new Error("no live snapshot");
  return { ...snapshot, incarnation: snapshot.sessionIncarnation };
}

function sendParams(h: Harness, seen: Awaited<ReturnType<typeof observe>>, key: string) {
  return {
    agentId: h.agentId,
    text: `hello ${key}`,
    idempotencyKey: key,
    expectedSessionIncarnation: seen.incarnation,
    expectedPermissionGeneration: seen.permissionGeneration,
    onActiveTurn: "reject" as const,
  };
}

function expectNoSideEffects(h: Harness): void {
  expect(h.provider.callsOf("startTurn")).toEqual([]);
  expect(h.provider.callsOf("steer")).toEqual([]);
  expect(h.provider.callsOf("interrupt")).toEqual([]);
  expect(h.provider.callsOf("respondToPermission")).toEqual([]);
}

function question(h: Harness, id = "question-full-id", kind = "question") {
  h.provider.session.raise({
    id,
    kind: kind as "question",
    name: kind === "question" ? "AskUserQuestion" : "Bash",
    input: {
      questions: [
        {
          question: "Choose a provider?",
          options: [{ label: "Claude" }, { label: "Codex" }],
          multiSelect: false,
        },
      ],
    },
  });
  return until(
    async () => (await observe(h)).pending.some((p) => p.permissionRequestId === id),
    id,
  );
}

function answerParams(h: Harness, seen: Awaited<ReturnType<typeof observe>>, key: string) {
  return {
    agentId: h.agentId,
    permissionRequestId: "question-full-id",
    idempotencyKey: key,
    expectedSessionIncarnation: seen.incarnation,
    expectedPermissionGeneration: seen.permissionGeneration,
    answer: { kind: "option" as const, label: "Claude" },
  };
}

describe("keeper guarded question answer", () => {
  test("answers one exact question and returns a durable receipt", async () => {
    const h = await setup();
    await question(h);
    const seen = await observe(h);
    const reply = await h.ctx.client.keeperAnswerQuestion(answerParams(h, seen, "answer-ok"));
    expect(reply).toMatchObject({ result: "accepted", reason: null });
    const directory = path.join(h.ctx.daemon.paseoHome, "keeper-answer-receipts");
    const receipt = JSON.parse(
      readFileSync(path.join(directory, readdirSync(directory)[0]), "utf8"),
    );
    expect(receipt).toMatchObject({ state: "completed", delivery: "answered" });
    expect(reply.receiptId).toEqual(expect.any(String));
    expect(h.provider.callsOf("respondToPermission")).toEqual([
      { kind: "respondToPermission", requestId: "question-full-id" },
    ]);
    expect((await observe(h)).pending).toEqual([]);
  });

  test("rejects stale incarnation without touching the question", async () => {
    const h = await setup();
    await question(h);
    const seen = await observe(h);
    const reply = await h.ctx.client.keeperAnswerQuestion({
      ...answerParams(h, seen, "answer-inc"),
      expectedSessionIncarnation: "old-incarnation",
    });
    expect(reply).toMatchObject({ result: "rejected", reason: "stale_incarnation" });
    expect(h.provider.callsOf("respondToPermission")).toEqual([]);
    expect((await observe(h)).pending).toHaveLength(1);
    const page = await h.ctx.client.keeperReadEvents({ cursor: null });
    expect(page.events).toContainEqual(
      expect.objectContaining({
        type: "answer.rejected",
        reason: "stale_incarnation",
        permissionRequestId: "question-full-id",
      }),
    );
  });

  test("rejects stale generation without touching the question", async () => {
    const h = await setup();
    await question(h);
    const seen = await observe(h);
    const reply = await h.ctx.client.keeperAnswerQuestion({
      ...answerParams(h, seen, "answer-gen"),
      expectedPermissionGeneration: seen.permissionGeneration - 1,
    });
    expect(reply).toMatchObject({ result: "rejected", reason: "stale_generation" });
    expect(h.provider.callsOf("respondToPermission")).toEqual([]);
    expect((await observe(h)).pending).toHaveLength(1);
  });

  test("does not resolve an ID prefix", async () => {
    const h = await setup();
    await question(h);
    const seen = await observe(h);
    const reply = await h.ctx.client.keeperAnswerQuestion({
      ...answerParams(h, seen, "answer-prefix"),
      permissionRequestId: "question-full",
    });
    expect(reply).toMatchObject({ result: "rejected", reason: "question_not_found" });
    expect(h.provider.callsOf("respondToPermission")).toEqual([]);
    expect((await observe(h)).pending.map((p) => p.permissionRequestId)).toEqual([
      "question-full-id",
    ]);
  });

  test("refuses a tool permission gate", async () => {
    const h = await setup();
    await question(h, "question-full-id", "tool");
    const seen = await observe(h);
    const reply = await h.ctx.client.keeperAnswerQuestion(answerParams(h, seen, "answer-tool"));
    expect(reply).toMatchObject({ result: "rejected", reason: "not_question" });
    expect(h.provider.callsOf("respondToPermission")).toEqual([]);
    expect((await observe(h)).pending).toHaveLength(1);
  });

  test("repeated idempotency key returns one receipt and answers once", async () => {
    const h = await setup();
    await question(h);
    const seen = await observe(h);
    const params = answerParams(h, seen, "answer-repeat");
    const first = await h.ctx.client.keeperAnswerQuestion(params);
    const second = await h.ctx.client.keeperAnswerQuestion(params);
    expect(first).toMatchObject({ result: "accepted" });
    expect(second).toMatchObject({ result: "duplicate", receiptId: first.receiptId });
    expect(h.provider.callsOf("respondToPermission")).toHaveLength(1);
  });

  test("disabled flag refuses without answering", async () => {
    const h = await setup(false);
    h.provider.session.raise({ id: "question-full-id", kind: "question", name: "AskUserQuestion" });
    const reply = await h.ctx.client.keeperAnswerQuestion({
      agentId: h.agentId,
      permissionRequestId: "question-full-id",
      idempotencyKey: "answer-off",
      expectedSessionIncarnation: "any",
      expectedPermissionGeneration: 0,
      answer: { kind: "option", label: "Claude" },
    });
    expect(reply).toMatchObject({ result: "rejected", reason: "disabled" });
    expect(h.provider.callsOf("respondToPermission")).toEqual([]);
  });

  test("human answer wins the lane and the keeper cannot answer twice", async () => {
    const h = await setup();
    await question(h);
    const seen = await observe(h);
    const manager = h.ctx.daemon.daemon.agentManager;
    const human = manager.respondToPermission(h.agentId, "question-full-id", {
      behavior: "allow",
      updatedInput: { answers: { "Choose a provider?": "Codex" } },
    });
    const keeper = h.ctx.client.keeperAnswerQuestion(answerParams(h, seen, "answer-human-race"));
    await human;
    expect(await keeper).toMatchObject({ result: "rejected", reason: "stale_generation" });
    expect(h.provider.callsOf("respondToPermission")).toHaveLength(1);
  });

  test("rejects an option absent from the pending question", async () => {
    const h = await setup();
    await question(h);
    const seen = await observe(h);
    const reply = await h.ctx.client.keeperAnswerQuestion({
      ...answerParams(h, seen, "answer-invalid"),
      answer: { kind: "option", label: "Bash" },
    });
    expect(reply).toMatchObject({ result: "rejected", reason: "invalid_answer" });
    expect(h.provider.callsOf("respondToPermission")).toEqual([]);
    expect((await observe(h)).pending).toHaveLength(1);
  });
});

describe("keeper atomic send", () => {
  test("an exact-match send starts one turn and reports what was acknowledged", async () => {
    const h = await setup();
    const seen = await observe(h);
    const reply = await h.ctx.client.keeperSendMessage(sendParams(h, seen, "k1"));
    expect(reply).toMatchObject({ result: "accepted", delivery: "turn_started", reason: null });
    expect(h.provider.callsOf("startTurn")).toEqual([{ kind: "startTurn", text: "hello k1" }]);
    expect(h.provider.callsOf("interrupt")).toEqual([]);
  });

  test("a completed receipt carries the admitted identity and a rejected send writes none", async () => {
    const h = await setup();
    const dir = path.join(h.ctx.daemon.paseoHome, "keeper-send-receipts");
    const files = () => (existsSync(dir) ? readdirSync(dir) : []);
    const receipts = () => files().map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")));
    const seen = await observe(h);
    const stale = { ...sendParams(h, seen, "kr0"), expectedPermissionGeneration: 99 };
    expect(await h.ctx.client.keeperSendMessage(stale)).toMatchObject({ result: "rejected" });
    expect(files()).toEqual([]);
    const { bootId } = await h.ctx.client.keeperGetSnapshot(h.agentId);
    await h.ctx.client.keeperSendMessage(sendParams(h, seen, "kr1"));
    expect(receipts()).toEqual([
      expect.objectContaining({
        state: "completed",
        admission: {
          bootId,
          sessionIncarnation: seen.incarnation,
          permissionGeneration: seen.permissionGeneration,
        },
      }),
    ]);
  });

  test("a send queued behind a session reload is rejected against the new incarnation", async () => {
    const h = await setup();
    const seen = await observe(h);
    const reloading = h.ctx.daemon.daemon.agentManager.reloadAgentSession(h.agentId);
    const reply = await h.ctx.client.keeperSendMessage(sendParams(h, seen, "k3b"));
    await reloading;
    expect(reply).toMatchObject({ result: "rejected", reason: "stale_incarnation" });
    expectNoSideEffects(h);
  });

  test("a question that arrived before admission rejects the stale send untouched", async () => {
    const h = await setup();
    const seen = await observe(h);
    h.provider.session.raise({ id: "question-b" });
    await until(async () => (await observe(h)).pending.length === 1, "question B");
    const reply = await h.ctx.client.keeperSendMessage(sendParams(h, seen, "k2"));
    expect(reply).toMatchObject({ result: "rejected", reason: "stale_generation" });
    expectNoSideEffects(h);
    expect((await observe(h)).pending.map((p) => p.permissionRequestId)).toEqual(["question-b"]);
  });

  test("a replaced session rejects a send aimed at the old incarnation", async () => {
    const h = await setup();
    const seen = await observe(h);
    await h.ctx.daemon.daemon.agentManager.reloadAgentSession(h.agentId);
    expect(h.provider.sessions).toHaveLength(2);
    const reply = await h.ctx.client.keeperSendMessage(sendParams(h, seen, "k3"));
    expect(reply).toMatchObject({ result: "rejected", reason: "stale_incarnation" });
    expectNoSideEffects(h);
  });

  test("a question raised while the provider holds the send stays pending", async () => {
    const h = await setup();
    const seen = await observe(h);
    const release = h.provider.holdStartTurn();
    const sending = h.ctx.client.keeperSendMessage(sendParams(h, seen, "k4"));
    await until(() => h.provider.heldStarts === 1, "provider to hold the start");
    h.provider.session.raise({ id: "question-b" });
    release();
    expect(await sending).toMatchObject({ result: "accepted" });
    await until(async () => (await observe(h)).pending.length === 1, "question B pending");
    expect(h.provider.callsOf("respondToPermission")).toEqual([]);
    expect(h.provider.callsOf("interrupt")).toEqual([]);
    expect(h.provider.callsOf("startTurn")).toHaveLength(1);
  });

  test("a close queued behind a held start waits for the acknowledgement", async () => {
    const h = await setup();
    const seen = await observe(h);
    const release = h.provider.holdStartTurn();
    const sending = h.ctx.client.keeperSendMessage(sendParams(h, seen, "k3c"));
    await until(() => h.provider.heldStarts === 1, "provider to hold the start");
    let closed = false;
    const closing = (async () => {
      await h.ctx.daemon.daemon.agentManager.closeAgent(h.agentId);
      closed = true;
    })();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(closed).toBe(false);
    release();
    expect(await sending).toMatchObject({ result: "accepted", delivery: "turn_started" });
    await closing;
  });

  test("a turn that finishes at once still reports the acknowledgement", async () => {
    const h = await setup();
    const seen = await observe(h);
    h.provider.finishOnStart = true;
    const reply = await h.ctx.client.keeperSendMessage(sendParams(h, seen, "k3d"));
    expect(reply).toMatchObject({ result: "accepted", delivery: "turn_started" });
    expect(h.provider.callsOf("startTurn")).toHaveLength(1);
  });

  test("a retry that overlaps the first attempt sends at most once", async () => {
    const h = await setup();
    const seen = await observe(h);
    const release = h.provider.holdStartTurn();
    const params = sendParams(h, seen, "k5");
    const first = h.ctx.client.keeperSendMessage(params);
    await until(() => h.provider.heldStarts === 1, "provider to hold the start");
    const retry = h.ctx.client.keeperSendMessage(params);
    release();
    expect((await first).result).toBe("accepted");
    expect(await retry).toMatchObject({ result: "duplicate", delivery: "turn_started" });
    expect(h.provider.callsOf("startTurn")).toHaveLength(1);
  });

  test("a pending receipt left by an uncertain attempt blocks any resend", async () => {
    const h = await setup();
    const seen = await observe(h);
    const params = sendParams(h, seen, "k6");
    const receipts = new KeeperSendReceipts(
      path.join(h.ctx.daemon.paseoHome, "keeper-send-receipts"),
    );
    await receipts.reserve(h.agentId, "k6", sendFingerprint(params.text, params.onActiveTurn));
    expect(await h.ctx.client.keeperSendMessage(params)).toMatchObject({
      result: "outcome_unknown",
    });
    const conflict = await h.ctx.client.keeperSendMessage({ ...params, text: "different" });
    expect(conflict).toMatchObject({ result: "rejected", reason: "idempotency_conflict" });
    expectNoSideEffects(h);
  });

  test("a pending question rejects a send unless the caller allows it", async () => {
    const h = await setup();
    h.provider.session.raise({ id: "question-a" });
    await until(async () => (await observe(h)).pending.length === 1, "question A");
    const seen = await observe(h);
    const reply = await h.ctx.client.keeperSendMessage(sendParams(h, seen, "k7"));
    expect(reply).toMatchObject({ result: "rejected", reason: "permission_pending" });
    expectNoSideEffects(h);
  });

  test("onActiveTurn reject refuses a running turn and steer delivers into it", async () => {
    const h = await setup();
    const first = await observe(h);
    await h.ctx.client.keeperSendMessage(sendParams(h, first, "k8a"));
    const busy = await observe(h);
    const refused = await h.ctx.client.keeperSendMessage(sendParams(h, busy, "k8b"));
    expect(refused).toMatchObject({ result: "rejected", reason: "turn_active" });
    const steered = await h.ctx.client.keeperSendMessage({
      ...sendParams(h, busy, "k8c"),
      onActiveTurn: "steer",
    });
    expect(steered).toMatchObject({ result: "accepted", delivery: "steered" });
    expect(h.provider.callsOf("steer")).toHaveLength(1);
    expect(h.provider.callsOf("interrupt")).toEqual([]);
  });

  test("a question arriving during the durable reserve is caught by the second comparison", async () => {
    const h = await setup();
    const seen = await observe(h);
    let committed = false;
    let released = false;
    const result = await h.ctx.daemon.daemon.agentManager.admitGuarded(
      h.agentId,
      {
        expectedSessionIncarnation: seen.incarnation,
        expectedPermissionGeneration: seen.permissionGeneration,
        reserve: async () => {
          h.provider.session.raise({ id: "question-b" });
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { ok: true };
        },
        release: async () => {
          released = true;
        },
      },
      async () => {
        committed = true;
      },
    );
    expect(result).toMatchObject({ rejected: "stale_generation" });
    expect({ committed, released }).toEqual({ committed: false, released: true });
    expectNoSideEffects(h);
    expect((await observe(h)).pending).toHaveLength(1);
  });

  test("the event feed resumes from a cursor without loss or duplication", async () => {
    const h = await setup();
    const start = (await observe(h)).eventCursor;
    h.provider.session.raise({ id: "q1", title: "TOP-SECRET-TITLE", input: { token: "sk-leak" } });
    h.provider.session.raise({ id: "q2", kind: "tool" });
    const all = await h.ctx.client.keeperReadEvents({ cursor: start, limit: 100, waitMs: 2_000 });
    await until(async () => {
      const page = await h.ctx.client.keeperReadEvents({ cursor: start, limit: 100 });
      return page.events.length >= 2;
    }, "two events");
    const full = await h.ctx.client.keeperReadEvents({ cursor: start, limit: 100 });
    const paged = [] as typeof full.events;
    let cursor = start;
    for (let i = 0; i < 10; i += 1) {
      const page = await h.ctx.client.keeperReadEvents({ cursor, limit: 1 });
      if (page.events.length === 0) break;
      paged.push(...page.events);
      cursor = page.nextCursor;
    }
    expect(paged.map((e) => e.eventId)).toEqual(full.events.map((e) => e.eventId));
    expect(new Set(paged.map((e) => e.seq)).size).toBe(paged.length);
    expect(full.events.map((e) => e.category)).toEqual(["question", "permission"]);
    expect(JSON.stringify([all, full])).not.toMatch(/TOP-SECRET-TITLE|sk-leak/);
    const after = await h.ctx.client.keeperReadEvents({ cursor, limit: 10 });
    expect(after.events).toEqual([]);
    const detail = await h.ctx.client.keeperGetPendingRequest({
      agentId: h.agentId,
      permissionRequestId: "q1",
      expectedSessionIncarnation: full.events[0].sessionIncarnation ?? "",
      expectedPermissionGeneration: (await observe(h)).permissionGeneration,
    });
    expect(detail.detail?.title).toBe("TOP-SECRET-TITLE");
  });

  test("a keeper RPC is refused when the daemon has not opted in", async () => {
    const h = await setup(false);
    const reply = await h.ctx.client.keeperSendMessage({
      agentId: h.agentId,
      text: "x",
      idempotencyKey: "off",
      expectedSessionIncarnation: "i",
      expectedPermissionGeneration: 0,
      onActiveTurn: "reject",
    });
    expect(reply).toMatchObject({ result: "rejected", reason: "disabled" });
    expectNoSideEffects(h);
  });
});
