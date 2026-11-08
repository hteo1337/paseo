// Browsers have no OS credential vault. Keep credentials in memory for this tab.
const credentials = new Map<string, string>();
export async function loadDeviceCredential(_serverId: string) {}
export function getDeviceCredential(serverId: string) {
  return credentials.get(serverId);
}
export async function saveDeviceCredential(serverId: string, credential: string) {
  credentials.set(serverId, credential);
}
