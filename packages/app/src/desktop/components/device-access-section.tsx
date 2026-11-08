import { StyleSheet } from "react-native-unistyles";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { Button } from "@/components/ui/button";

type DeviceList = Awaited<ReturnType<DaemonClient["manageDevices"]>>;
export function DeviceAccessSection({ client }: { client: DaemonClient }) {
  const [data, setData] = useState<DeviceList>({ devices: [], pending: [] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setData(await client.manageDevices("list"));
      setError(null);
    } catch {
      setError("Could not load device access. Retry while this host is connected.");
    }
  }, [client]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function act(action: "approve" | "revoke", id: string) {
    setBusy(true);
    setError(null);
    try {
      setData(await client.manageDevices(action, id));
    } catch {
      setError("Device access could not be changed. Retry while this host is connected.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Device access</Text>
      <Text style={styles.text}>
        Compare the code on the new device before approving. Approval grants your current host
        permissions.
      </Text>
      {error ? (
        <Text style={styles.text} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button disabled={busy} onPress={refresh}>
        Refresh devices
      </Button>
      {data.pending.map((entry) => (
        <View key={entry.id}>
          <Text style={styles.text}>
            {entry.name} · {entry.code}
          </Text>
          <Button disabled={busy} onPress={deviceAction(act, "approve", entry.id)}>
            Approve matching code
          </Button>
        </View>
      ))}
      {data.devices.map((entry) => (
        <View key={entry.id}>
          <Text style={styles.text}>
            {entry.name} · {entry.createdAt}
          </Text>
          <Button disabled={busy} onPress={deviceAction(act, "revoke", entry.id)}>
            Revoke
          </Button>
        </View>
      ))}
    </View>
  );
}

function deviceAction(
  act: (action: "approve" | "revoke", id: string) => Promise<void>,
  action: "approve" | "revoke",
  id: string,
) {
  return () => {
    void act(action, id);
  };
}

const styles = StyleSheet.create((theme) => ({
  container: { gap: theme.spacing[3], marginBottom: theme.spacing[4] },
  text: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
}));
