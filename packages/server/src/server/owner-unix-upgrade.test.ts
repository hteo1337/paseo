import { createServer } from "node:http";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { expect, it } from "vitest";
import { VoiceAssistantWebSocketServer } from "./websocket-server.js";
import { startOwnerUnixListener } from "./owner-unix-listener.js";
import { resolveSessionAdmission } from "./session-admission-auth.js";
import { ownerUnixOrigin } from "./owner-unix-origin.js";

it.skipIf(process.platform !== "darwin")(
  "additional Unix upgrade retains normal header/hello credentials and cannot lend origin to TCP",
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "paseo-auth-"))),
      path = join(root, "owner.sock");
    const password = "$2b$12$OLxyuuP9uLK30Uzc4wQX0O6liuU/Q1t5P2b0Ebf36mULvpVK3DRZW";
    // Use actual upgrade/header auth functions, with a fixture-only hello handler
    // so no provider/quota/daemon constructor or shared state is materialized.
    const host = Object.create(VoiceAssistantWebSocketServer.prototype);
    host.serverId = "fixture-server";
    host.connectionLifecycle = "accepting";
    host.passwordHash = password;
    host.logger = { warn() {}, error() {} };
    host.attachSocket = async (
      ws: WebSocket,
      _request: unknown,
      _metadata: unknown,
      _internal: unknown,
      headerAdmission: unknown,
    ) => {
      ws.on("message", async (data) => {
        const helloMessage = JSON.parse(data.toString());
        const result = headerAdmission
          ? { admission: headerAdmission }
          : await resolveSessionAdmission({
              credential: helloMessage.auth,
              passwordHash: password,
              localCredential: null,
              transport: "direct",
            });
        ws.send(JSON.stringify({ ...result, origin: ownerUnixOrigin(ws) ?? null }));
      });
    };
    const tcp = createServer();
    host.wss = host.createWebSocketServer(tcp, { allowedOrigins: new Set() }, { password });
    await new Promise<void>((resolve) => tcp.listen(0, "127.0.0.1", resolve));
    const stop = await startOwnerUnixListener(path, (request, socket, head) =>
      host.attachOwnerUnixUpgrade(request, socket, head),
    );
    const sockets: WebSocket[] = [];
    async function hello(url: string, auth?: unknown) {
      const ws = new WebSocket(url);
      sockets.push(ws);
      await new Promise<void>((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
      });
      const response = new Promise<Record<string, unknown>>((resolve) =>
        ws.once("message", (data) => resolve(JSON.parse(data.toString()))),
      );
      ws.send(
        JSON.stringify({ type: "hello", clientId: "same-client", ...(auth ? { auth } : {}) }),
      );
      return response;
    }
    try {
      expect((await hello(`ws+unix://${path}:/ws`)).rejection).toBe("password_required");
      expect(
        (await hello(`ws+unix://${path}:/ws`, { kind: "password", password: "wrong" })).rejection,
      ).toBe("incorrect_password");
      const local = await hello(`ws+unix://${path}:/ws`, {
        kind: "password",
        password: "correct-password",
      });
      expect(local.admission).toBeDefined();
      expect(local.origin).toMatchObject({
        kind: "owner-unix",
        serverId: "fixture-server",
        peerUid: process.getuid!(),
      });
      const remote = await hello(`ws://127.0.0.1:${(tcp.address() as { port: number }).port}/ws`, {
        kind: "password",
        password: "correct-password",
      });
      expect(remote.admission).toBeDefined();
      expect(remote.origin).toBeNull();
      const wrongHeader = new WebSocket(`ws+unix://${path}:/ws`, {
        headers: { Authorization: "Bearer wrong" },
      });
      sockets.push(wrongHeader);
      const code = await new Promise<number>((resolve, reject) => {
        wrongHeader.once("close", resolve);
        wrongHeader.once("error", reject);
      });
      expect(code).not.toBe(1000);
    } finally {
      for (const ws of sockets) ws.terminate();
      await stop();
      await new Promise<void>((resolve) => host.wss.close(() => tcp.close(() => resolve())));
      rmSync(root, { recursive: true, force: true });
    }
  },
  15000,
);
