import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

interface ProjectGroupViewState {
  collapseOverrides: Record<string, boolean>;
  hideInactive: boolean;
  toggleGroup: (key: string, current: boolean) => void;
  toggleHideInactive: () => void;
}
const GroupViewSchema = z.object({
  collapseOverrides: z.record(z.string(), z.boolean()),
  hideInactive: z.boolean(),
});

export const useProjectGroupViewStore = create<ProjectGroupViewState>()(
  persist(
    (set) => ({
      collapseOverrides: {},
      hideInactive: false,
      toggleGroup: (key, current) =>
        set((state) => ({ collapseOverrides: { ...state.collapseOverrides, [key]: !current } })),
      toggleHideInactive: () => set((state) => ({ hideInactive: !state.hideInactive })),
    }),
    {
      name: "project-group-view",
      storage: createValidatedPersistStorage(AsyncStorage, GroupViewSchema),
      partialize: ({ collapseOverrides, hideInactive }) => ({ collapseOverrides, hideInactive }),
    },
  ),
);
