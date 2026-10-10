import { createRequire } from "node:module";
import { closeSync } from "node:fs";
import type { Socket } from "node:net";
import type { PluginInvocationContext } from "@getpaseo/plugin/server";

type Origin = NonNullable<PluginInvocationContext["origin"]>;
const origins = new WeakMap<object, { socket: Socket; origin: Origin }>();
const require = createRequire(import.meta.url);

/** Missing native code/unsupported descriptor access denies locality. Never use
 * loopback addresses, a configured peer UID, hello fields, or Session identity. */
export function assertOwnerUnixCredentialsAvailable(): void {
  if (
    process.platform !== "darwin" ||
    ["peerUid", "createListener"].some(
      (name) => typeof Reflect.get(require("./native/peer-credentials.node"), name) !== "function",
    )
  )
    throw new Error("Owner Unix credentials unavailable");
}

export function ownerUnixListenerFd(path: string): number {
  assertOwnerUnixCredentialsAvailable();
  return (
    require("./native/peer-credentials.node") as { createListener(path: string): number }
  ).createListener(path);
}
export function closeOwnerUnixFd(fd: number): void {
  closeSync(fd);
}

export function kernelPeerUid(socket: Socket): number {
  if (process.platform !== "darwin") throw new Error("Owner Unix credentials unsupported");
  const handle = Reflect.get(socket, "_handle") as { fd?: unknown } | undefined;
  const fd = handle?.fd;
  if (!Number.isInteger(fd) || typeof fd !== "number" || fd < 0)
    throw new Error("Socket descriptor unavailable");
  const native = require("./native/peer-credentials.node") as { peerUid(fd: number): number };
  return native.peerUid(fd);
}

export function bindOwnerUnixOrigin(source: object, socket: Socket, serverId: string): void {
  const ownerUid = process.getuid?.();
  if (ownerUid === undefined || socket.destroyed || !serverId)
    throw new Error("Owner Unix authority unavailable");
  const peerUid = kernelPeerUid(socket);
  if (peerUid !== ownerUid) throw new Error("Owner Unix peer denied");
  origins.set(source, {
    socket,
    origin: Object.freeze({ kind: "owner-unix", serverId, ownerUid, peerUid }),
  });
}

/** Evidence is specific to this request's still-live physical socket. */
export function ownerUnixOrigin(source?: object): Origin | undefined {
  const entry = source && origins.get(source);
  return entry && !entry.socket.destroyed ? entry.origin : undefined;
}
