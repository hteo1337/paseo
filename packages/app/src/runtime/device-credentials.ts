import * as SecureStore from "expo-secure-store";
const credentials = new Map<string, string>();
const key = (serverId: string) =>
  `paseo.device.${Array.from(serverId)
    .map((character) => character.codePointAt(0)!.toString(16))
    .join("_")}`;
export async function loadDeviceCredential(serverId: string) {
  const credential = await SecureStore.getItemAsync(key(serverId));
  if (credential) credentials.set(serverId, credential);
}
export function getDeviceCredential(serverId: string) {
  return credentials.get(serverId);
}
export async function saveDeviceCredential(serverId: string, credential: string) {
  await SecureStore.setItemAsync(key(serverId), credential, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  credentials.set(serverId, credential);
}
