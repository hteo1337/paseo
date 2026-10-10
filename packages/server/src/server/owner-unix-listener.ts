import {
  assertOwnerUnixCredentialsAvailable,
  ownerUnixListenerFd,
  closeOwnerUnixFd,
} from "./owner-unix-origin.js";
import { createServer, type IncomingMessage } from "node:http";
import { chmodSync, fstatSync, lstatSync, realpathSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import type { Duplex } from "node:stream";

/** Owner-private, additional endpoint. Never replaces normal listeners or
 * authentication. No stale path removal; cleanup only our own socket inode. */
export async function startOwnerUnixListener(
  path: string,
  upgrade: (request: IncomingMessage, socket: Duplex, head: Buffer) => void,
) {
  assertOwnerUnixCredentialsAvailable();
  const uid = process.getuid?.();
  if (
    process.platform !== "darwin" ||
    uid === undefined ||
    !isAbsolute(path) ||
    path.includes("\0") ||
    Buffer.byteLength(path) > 100
  )
    throw new Error("Owner Unix endpoint unsupported");
  const parent = dirname(path),
    directory = lstatSync(parent);
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    realpathSync(parent) !== parent ||
    directory.uid !== uid ||
    (directory.mode & 0o777) !== 0o700
  )
    throw new Error("Owner Unix directory must be canonical, owned and private");
  try {
    lstatSync(path);
    throw new Error("Owner Unix endpoint already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const server = createServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  const sockets = new Set<Duplex>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws") {
      socket.destroy();
      return;
    }
    upgrade(request, socket, head);
  });
  const fd = ownerUnixListenerFd(path);
  let descriptor: ReturnType<typeof fstatSync> | undefined;
  let inode: ReturnType<typeof lstatSync> | undefined;
  let adopted = false;
  const cleanup = async () => {
    for (const socket of sockets) socket.destroy();
    if (adopted) await new Promise<void>((resolve) => server.close(() => resolve()));
    else closeOwnerUnixFd(fd);
    // Failed adoption may leave the original descriptor open. Never close a
    // descriptor number reused by another socket after Node released it.
    if (adopted) {
      try {
        const current = fstatSync(fd);
        if (descriptor && current.dev === descriptor.dev && current.ino === descriptor.ino)
          closeOwnerUnixFd(fd);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EBADF") throw error;
      }
    }
    try {
      const current = lstatSync(path);
      if (inode && current.dev === inode.dev && current.ino === inode.ino && current.isSocket())
        unlinkSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  };
  try {
    descriptor = fstatSync(fd);
    inode = lstatSync(path);
    chmodSync(path, 0o600);
    const current = lstatSync(path);
    if (
      !current.isSocket() ||
      current.dev !== inode.dev ||
      current.ino !== inode.ino ||
      current.uid !== uid ||
      (current.mode & 0o777) !== 0o600
    )
      throw new Error("Owner Unix socket unsafe");
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      adopted = true;
      server.listen({ fd }, () => resolve());
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
  return cleanup;
}
