import { saveDeviceCredential } from "./device-credentials";
let notices: Record<string, string> = {};
const listeners = new Set<() => void>();
export const deviceEnrollmentStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  snapshot() {
    return notices;
  },
};
function setNotice(serverId: string, message: string | null) {
  notices = { ...notices };
  if (message) notices[serverId] = message;
  else delete notices[serverId];
  for (const listener of listeners) listener();
}
export async function handleDeviceEnrollment(
  serverId: string,
  event: { id: string; code: string; credential?: string },
) {
  if (event.credential) {
    try {
      await saveDeviceCredential(serverId, event.credential);
      setNotice(serverId, null);
    } catch {
      setNotice(
        serverId,
        "Could not save device credential. Reconnect and approve this device again to retry.",
      );
      throw new Error("Secure storage failed");
    }
  } else {
    setNotice(
      serverId,
      `Approve code ${event.code} in Pair device on a trusted client for this host. This request expires in two minutes.`,
    );
  }
}
