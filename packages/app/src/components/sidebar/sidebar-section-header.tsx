import { useMemo, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DensityIcon } from "@/components/ui/density-icon";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative, isWeb } from "@/constants/platform";
import { density } from "@/styles/density";

/** A sidebar section label such as "Pinned" or "Workspaces". A section with `onToggle`
 * collapses from its title; children sit at the trailing edge as its actions. */
export function SidebarSectionHeader({
  title,
  collapsed,
  onToggle,
  testID,
  children,
  counts,
  attentionCount,
}: {
  title: string;
  collapsed?: boolean;
  onToggle?: () => void;
  testID?: string;
  children?: ReactNode;
  counts?: string;
  attentionCount?: number;
}) {
  return (
    <View style={styles.header}>
      {onToggle ? (
        <CollapsibleTitle
          title={title}
          collapsed={collapsed ?? false}
          onToggle={onToggle}
          testID={testID}
          counts={counts}
          attentionCount={attentionCount}
        />
      ) : (
        <Text style={styles.title} testID={testID}>
          {title}
        </Text>
      )}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

function CollapsibleTitle({
  title,
  collapsed,
  onToggle,
  testID,
  counts,
  attentionCount = 0,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  testID?: string;
  counts?: string;
  attentionCount?: number;
}) {
  const isCompact = useIsCompactFormFactor();
  const accessibilityState = useMemo(() => ({ expanded: !collapsed }), [collapsed]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      {...(isWeb ? { "aria-expanded": !collapsed } : {})}
      onPress={onToggle}
      style={styles.toggle}
      testID={testID}
    >
      {({ hovered }) => (
        <>
          <Text style={styles.title}>{title}</Text>
          {counts ? <Text style={styles.counts}>{counts}</Text> : null}
          {attentionCount > 0 ? (
            <Text
              style={styles.attention}
              accessibilityLabel={`${attentionCount} workspaces need attention`}
            >
              ● {attentionCount}
            </Text>
          ) : null}
          {hovered || isNative || isCompact ? (
            <DensityIcon
              icon={collapsed ? ChevronRight : ChevronDown}
              size="xs"
              color="foregroundMuted"
            />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    minHeight: density.rowHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    // The title lands at spacing[2] to align with the rows' leading icons. Trailing actions
    // are icon buttons whose painted glyph stops inside the SVG box, so 4px aligns the ink
    // rather than the box to the row rail.
    paddingLeft: theme.spacing[2],
    paddingRight: 4,
    userSelect: "none",
  },
  // The toggle reaches back over the header's leading padding so the whole label edge is pressable.
  toggle: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    marginLeft: -theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
  },
  counts: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm - 2,
    flexShrink: 1,
  },
  attention: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm - 2,
    fontWeight: theme.fontWeight.medium,
  },
  title: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
}));
