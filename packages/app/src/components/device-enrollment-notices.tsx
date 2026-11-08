import { useSyncExternalStore } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Alert } from "@/components/ui/alert";
import { deviceEnrollmentStore } from "@/runtime/device-enrollment";
export function DeviceEnrollmentNotices() {
  const notices = useSyncExternalStore(
    deviceEnrollmentStore.subscribe,
    deviceEnrollmentStore.snapshot,
  );
  return (
    <View style={styles.container} pointerEvents="box-none">
      {Object.entries(notices).map(([serverId, message]) => (
        <Alert key={serverId} title={`Device approval · ${serverId}`} description={message} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    top: theme.spacing[4],
    left: theme.spacing[4],
    right: theme.spacing[4],
    zIndex: 10000,
    gap: theme.spacing[2],
  },
}));
