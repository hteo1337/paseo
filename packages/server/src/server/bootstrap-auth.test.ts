import { WebSocket } from "ws";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createTestPaseoDaemon } from "./test-utils/paseo-daemon.js";

const originalEnv = { ...process.env };
const CORRECT_PASSWORD_HASH = "$2b$12$OLxyuuP9uLK30Uzc4wQX0O6liuU/Q1t5P2b0Ebf36mULvpVK3DRZW";

function connectWebSocket(params: {
  port: number;
  protocol?: string;
}): Promise<{ ws: WebSocket; protocol: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${params.port}/ws`,
      params.protocol ? [params.protocol] : undefined,
    );
    ws.once("open", () => resolve({ ws, protocol: ws.protocol }));
    ws.once("error", reject);
  });
}

async function expectWebSocketCloses(params: {
  port: number;
  protocol?: string;
  code: number;
  reason: string;
}): Promise<void> {
  const { ws } = await connectWebSocket(params);
  await expect(
    new Promise<{ code: number; reason: string }>((resolve) => {
      ws.once("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    }),
  ).resolves.toEqual({
    code: params.code,
    reason: params.reason,
  });
}

describe("daemon bearer auth", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env = { ...originalEnv, PASEO_SUPERVISED: "0" };
  });

  test("approves a device, connects without a password, and revokes its active session", async () => {
    const daemon = await createTestPaseoDaemon({ auth: { password: CORRECT_PASSWORD_HASH } });
    const sockets: WebSocket[] = [];
    const next = (ws: WebSocket, type: string) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          ws.off("message", listener);
          reject(new Error(`Missing ${type}`));
        }, 3000);
        const listener = (raw: import("ws").RawData) => {
          const message = JSON.parse(raw.toString());
          if (message.type !== type) return;
          clearTimeout(timer);
          ws.off("message", listener);
          resolve(message);
        };
        ws.on("message", listener);
      });
    const hello = {
      type: "hello",
      clientId: "device-regression",
      clientType: "mobile",
      protocolVersion: 1,
    };
    try {
      const owner = (
        await connectWebSocket({ port: daemon.port, protocol: "paseo.bearer.correct-password" })
      ).ws;
      sockets.push(owner);
      const ownerReady = next(owner, "session");
      owner.send(JSON.stringify({ ...hello, clientId: "owner-regression" }));
      await ownerReady;
      const phone = (await connectWebSocket({ port: daemon.port, protocol: "paseo.device" })).ws;
      sockets.push(phone);
      const pending = next(phone, "access.device.enrollment");
      phone.send(JSON.stringify({ ...hello, enrollDevice: "Regression phone" }));
      const enrollment = await pending;
      expect(enrollment.credential).toBeUndefined();
      const denied = next(phone, "access.devices.response");
      phone.send(
        JSON.stringify({
          type: "access.devices.request",
          requestId: "denied",
          action: "approve",
          id: enrollment.id,
        }),
      );
      expect((await denied).error).toBe("Access management permission required");
      const issued = next(phone, "access.device.enrollment");
      const approval = next(owner, "access.devices.response");
      owner.send(
        JSON.stringify({
          type: "access.devices.request",
          requestId: "approve",
          action: "approve",
          id: enrollment.id,
        }),
      );
      const credential = (await issued).credential;
      expect(typeof credential).toBe("string");
      const listing = await approval;
      const devices = listing.devices as { id: string; name: string }[];
      expect(devices.map((d) => d.name)).toEqual(["Regression phone"]);
      const connected = (await connectWebSocket({ port: daemon.port, protocol: "paseo.device" }))
        .ws;
      sockets.push(connected);
      const ready = next(connected, "session");
      connected.send(JSON.stringify({ ...hello, deviceCredential: credential }));
      await ready;
      const closed = new Promise<number>((resolve) =>
        connected.once("close", (code) => resolve(code)),
      );
      const revoked = next(owner, "access.devices.response");
      owner.send(
        JSON.stringify({
          type: "access.devices.request",
          requestId: "revoke",
          action: "revoke",
          id: devices[0]!.id,
        }),
      );
      expect((await revoked).devices).toEqual([]);
      expect(await closed).toBe(4401);
      const rejected = (await connectWebSocket({ port: daemon.port, protocol: "paseo.device" })).ws;
      sockets.push(rejected);
      const refused = new Promise<number>((resolve) =>
        rejected.once("close", (code) => resolve(code)),
      );
      rejected.send(JSON.stringify({ ...hello, deviceCredential: credential }));
      expect(await refused).toBe(4401);
    } finally {
      for (const ws of sockets) ws.close();
      await daemon.close();
    }
  });

  test("leaves HTTP and WebSocket open when no password is configured", async () => {
    const daemonHandle = await createTestPaseoDaemon();
    try {
      const response = await fetch(`http://127.0.0.1:${daemonHandle.port}/api/status`);
      expect(response.status).toBe(200);

      const { ws, protocol } = await connectWebSocket({ port: daemonHandle.port });
      expect(protocol).toBe("");
      ws.close();
    } finally {
      await daemonHandle.close();
    }
  });

  test("requires Authorization bearer on protected HTTP routes when password is configured", async () => {
    const daemonHandle = await createTestPaseoDaemon({
      auth: { password: CORRECT_PASSWORD_HASH },
    });
    try {
      const missing = await fetch(`http://127.0.0.1:${daemonHandle.port}/api/status`);
      expect(missing.status).toBe(401);

      const wrong = await fetch(`http://127.0.0.1:${daemonHandle.port}/api/status`, {
        headers: { Authorization: "Bearer wrong-password" },
      });
      expect(wrong.status).toBe(401);

      const correct = await fetch(`http://127.0.0.1:${daemonHandle.port}/api/status`, {
        headers: { Authorization: "Bearer correct-password" },
      });
      expect(correct.status).toBe(200);
    } finally {
      await daemonHandle.close();
    }
  });

  test("allows file downloads with only a capability token when password is configured", async () => {
    const daemonHandle = await createTestPaseoDaemon({
      auth: { password: CORRECT_PASSWORD_HASH },
    });
    try {
      // No bearer at all: the route is reachable, but the download token store
      // rejects the request because no token was supplied (400, not 401).
      const missingToken = await fetch(`http://127.0.0.1:${daemonHandle.port}/api/files/download`);
      expect(missingToken.status).toBe(400);

      // An invalid token is rejected by the token store (403, not 401) — proving
      // the token, not the daemon password, is what guards this route.
      const invalidToken = await fetch(
        `http://127.0.0.1:${daemonHandle.port}/api/files/download?token=invalid-token`,
      );
      expect(invalidToken.status).toBe(403);
    } finally {
      await daemonHandle.close();
    }
  });

  test("bypasses bearer auth for preflight and liveness endpoints", async () => {
    const daemonHandle = await createTestPaseoDaemon({
      auth: { password: CORRECT_PASSWORD_HASH },
    });
    try {
      const preflight = await fetch(`http://127.0.0.1:${daemonHandle.port}/api/files/download`, {
        method: "OPTIONS",
        headers: { Origin: "https://app.paseo.sh" },
      });
      expect(preflight.status).toBe(204);

      const health = await fetch(`http://127.0.0.1:${daemonHandle.port}/api/health`);
      expect(health.status).toBe(200);

      const status = await fetch(`http://127.0.0.1:${daemonHandle.port}/api/status`);
      expect(status.status).toBe(401);
    } finally {
      await daemonHandle.close();
    }
  });

  test("closes WebSocket connections with readable auth failures when password is configured", async () => {
    const daemonHandle = await createTestPaseoDaemon({
      auth: { password: CORRECT_PASSWORD_HASH },
    });
    try {
      await expectWebSocketCloses({
        port: daemonHandle.port,
        code: 4401,
        reason: "Password required",
      });
      await expectWebSocketCloses({
        port: daemonHandle.port,
        protocol: "paseo.bearer.wrong-password",
        code: 4401,
        reason: "Incorrect password",
      });

      const { ws, protocol } = await connectWebSocket({
        port: daemonHandle.port,
        protocol: "paseo.bearer.correct-password",
      });
      expect(protocol).toBe("paseo.bearer.correct-password");
      ws.close();
    } finally {
      await daemonHandle.close();
    }
  });
});
