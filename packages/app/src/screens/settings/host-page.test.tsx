// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
const state = vi.hoisted(() => ({ online: false, originOnline: true, save: vi.fn() }));
vi.mock("react-native", () => ({ View: "div", Text: "span", Pressable: "button", Alert: {} }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  withUnistyles: () => () => null,
  useUnistyles: () => ({ theme: {} }),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeSnapshot: (serverId: string) => {
    if (serverId === "origin") {
      return { connectionStatus: state.originOnline ? "online" : "error" };
    }
    if (state.online) return { connectionStatus: "online" };
    return {
      connectionStatus: "error",
      lastError: "Password required",
      authFailureReason: "password_required",
      authFailureConnectionId: "direct",
      awaitingOriginServerId: "origin",
    };
  },
  useHosts: () => [
    {
      serverId: "host",
      label: "Host",
      connections: [
        { id: "direct", type: "directTcp", endpoint: "localhost:1234" },
        { id: "via:origin", type: "routed", originServerId: "origin" },
      ],
    },
  ],
  useHostMutations: () => ({ setHostPassword: state.save }),
}));
vi.mock("@/components/ui/form-field", () => ({
  Field: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormTextInput: ({ onChangeText }: { onChangeText: (text: string) => void }) => {
    const onChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        onChangeText(event.target.value);
      },
      [onChangeText],
    );
    return <input onChange={onChange} />;
  },
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ disabled, onPress }: { disabled: boolean; onPress: () => void }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      Connect
    </button>
  ),
}));
vi.mock("lucide-react-native", () => ({
  ArrowDown: () => null,
  ArrowUp: () => null,
  ArrowUpToLine: () => null,
  ChevronRight: () => null,
  Globe: () => null,
  Monitor: () => null,
  Pencil: () => null,
  Plus: () => null,
  RotateCw: () => null,
  SquareTerminal: () => null,
  Trash2: () => null,
}));
vi.mock("@getpaseo/protocol/terminal-profiles", () => ({
  getTerminalProfileIcon: () => null,
  DEFAULT_TERMINAL_PROFILES: () => null,
}));
vi.mock("@/agent-profiles", () => ({ AgentProfilesSection: () => null }));
vi.mock("@/agent-skills", () => ({ AgentSkillsSection: () => null }));
vi.mock("@/components/adaptive-modal-sheet", () => ({ AdaptiveModalSheet: () => null }));
vi.mock("@/components/settings-textarea", () => ({ SettingsTextAreaCard: () => null }));
vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/status-badge", () => ({ StatusBadge: () => null }));
vi.mock("@/components/ui/switch", () => ({ Switch: () => null }));
vi.mock("@/screens/settings/terminal-profile-edit-modal", () => ({
  ProfileDraft: () => null,
  TerminalProfileEditModal: () => null,
}));
vi.mock("@/desktop/daemon/desktop-daemon", () => ({
  startDesktopDaemon: () => null,
  stopDesktopDaemon: () => null,
}));
vi.mock("@/desktop/components/desktop-updates-section", () => ({ LocalDaemonSection: () => null }));
vi.mock("@/desktop/hooks/use-daemon-status", () => ({ useDaemonStatus: () => null }));
vi.mock("@/desktop/settings/desktop-settings", () => ({ useDesktopSettings: () => null }));
vi.mock("@/desktop/components/pair-device-modal", () => ({ PairDeviceModal: () => null }));
vi.mock("@/hooks/use-daemon-config", () => ({ useDaemonConfig: () => null }));
vi.mock("@/hooks/use-is-local-daemon", () => ({ useIsLocalDaemon: () => null }));
vi.mock("@/screens/settings/providers-section", () => ({ ProvidersSection: () => null }));
vi.mock("@/usage", () => ({ HostUsageSection: () => null }));
vi.mock("@/screens/settings/host-appearance-section", () => ({
  HostAppearanceSection: () => null,
}));
vi.mock("@/components/settings/headings/settings-section", () => ({ SettingsSection: () => null }));
vi.mock("@/stores/session-store", () => ({ useSessionStore: () => null }));
vi.mock("@/styles/settings", () => ({ settingsStyles: () => null }));
vi.mock("@/utils/confirm-dialog", () => ({ confirmDialog: () => null }));
vi.mock("@/desktop/updates/desktop-updates", () => ({ isVersionMismatch: () => null }));
vi.mock("@/utils/app-version", () => ({ resolveAppVersion: () => null }));
vi.mock("@/utils/daemons", () => ({
  formatConnectionStatus: () => null,
  getConnectionStatusTone: () => null,
}));
vi.mock("@/utils/latency", () => ({ formatLatency: () => null }));
vi.mock("@/styles/theme", () => ({ ICON_SIZE: () => null }));
vi.mock("@/components/provider-icons", () => ({ useProviderIcon: () => null }));
vi.mock("./browser-tools-card", () => ({ BrowserToolsOptInCard: () => null }));
vi.mock("./paseo-tools-card", () => ({ PaseoToolsCard: () => null }));
vi.mock("./restart-recovery-card", () => ({ RestartRecoveryCard: () => null }));
vi.mock("./idle-runtime-cleanup-card", () => ({ IdleRuntimeCleanupCard: () => null }));
vi.mock("./daemon-lifecycle", () => ({
  restartDaemonFromSettings: () => null,
  updateDaemonFromSettings: () => null,
}));
import { HostConnectionError } from "./host-page";
beforeEach(() => {
  state.online = false;
  state.originOnline = true;
  state.save.mockReset();
});
it("discards an unsubmitted password after the host reconnects another way", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () => act(() => root.render(<HostConnectionError serverId="host" />));
  try {
    render();
    act(() =>
      fireEvent.change(container.querySelector("input")!, { target: { value: "unsubmitted" } }),
    );
    expect(container.querySelector("button")!.disabled).toBe(false);
    state.online = true;
    render();
    expect(container.querySelector("input")).toBeNull();
    state.online = false;
    render();
    expect(container.querySelector("input")!.value).toBe("");
    expect(container.querySelector("button")!.disabled).toBe(true);
    act(() => container.querySelector("button")!.click());
    expect(state.save).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
  }
});

it("discards a draft across an origin flap while protecting an in-flight submission", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () => act(() => root.render(<HostConnectionError serverId="host" />));
  try {
    render();
    act(() =>
      fireEvent.change(container.querySelector("input")!, { target: { value: "synthetic-draft" } }),
    );
    expect(container.querySelector("button")!.disabled).toBe(false);
    state.originOnline = false;
    render();
    expect(container.querySelector("input")).toBeNull();
    state.originOnline = true;
    render();
    expect(container.querySelector("input")!.value.length).toBe(0);
    expect(container.querySelector("button")!.disabled).toBe(true);
    act(() => container.querySelector("button")!.click());
    expect(state.save).not.toHaveBeenCalled();

    let rejectSave!: () => void;
    state.save.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = () => reject(new Error("Synthetic storage failure"));
        }),
    );
    act(() =>
      fireEvent.change(container.querySelector("input")!, {
        target: { value: "synthetic-submission" },
      }),
    );
    act(() => container.querySelector("button")!.click());
    expect(state.save).toHaveBeenCalledTimes(1);
    state.online = true;
    render();
    expect(container.querySelector("button")!.disabled).toBe(true);
    state.online = false;
    render();
    await act(async () => rejectSave());
    // A failed save remains retryable: the online snapshot during saving must
    // not discard the submitted draft or change the argument already captured.
    expect(container.querySelector("button")!.disabled).toBe(false);
    expect(state.save.mock.calls[0][1].length > 0).toBe(true);
  } finally {
    act(() => root.unmount());
  }
});
