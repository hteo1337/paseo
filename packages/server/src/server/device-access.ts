import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DAEMON_PERMISSIONS, type DaemonPermission } from "./authorization/index.js";

const RecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  hash: z.string(),
  createdAt: z.string(),
  permissions: z.array(z.enum(DAEMON_PERMISSIONS)),
});
type DeviceRecord = z.infer<typeof RecordSchema>;

/** Only digests and explicit grants cross the persistence boundary. */
export class DeviceAccess {
  private records: DeviceRecord[];
  private readonly file: string;
  constructor(paseoHome: string) {
    this.file = path.join(paseoHome, "device-credentials.json");
    this.records = existsSync(this.file)
      ? z.array(RecordSchema).parse(JSON.parse(readFileSync(this.file, "utf8")))
      : [];
  }
  list() {
    return this.records.map(({ hash: _hash, ...record }) => record);
  }
  issue(name: string, permissions: readonly DaemonPermission[]) {
    const credential = `paseo_device_${randomBytes(32).toString("hex")}`;
    const record: DeviceRecord = {
      id: randomUUID(),
      name,
      hash: digest(credential),
      createdAt: new Date().toISOString(),
      permissions: [...permissions],
    };
    this.save([...this.records, record]);
    return { id: record.id, credential };
  }
  authenticate(credential: string | null) {
    if (!credential?.startsWith("paseo_device_")) return null;
    const provided = Buffer.from(digest(credential), "hex");
    return (
      this.records.find((record) => {
        const expected = Buffer.from(record.hash, "hex");
        return expected.length === provided.length && timingSafeEqual(expected, provided);
      }) ?? null
    );
  }
  revoke(id: string) {
    this.save(this.records.filter((record) => record.id !== id));
  }
  private save(records: DeviceRecord[]) {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(records), { mode: 0o600 });
    renameSync(temporary, this.file);
    this.records = records;
  }
}
function digest(credential: string) {
  return createHash("sha256").update(credential).digest("hex");
}
