import { RampDirection } from "@packages/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getRampDirectionFromPath } from "../helpers/path";

const defaultRampDirection = getRampDirectionFromPath();

export interface RampDirectionStore {
  activeDirection: RampDirection;
  onToggle: (direction: RampDirection) => void;
  reset: () => void;
}

export const useRampDirectionStore = create<RampDirectionStore>()(
  persist(
    set => ({
      activeDirection: defaultRampDirection,
      onToggle: (direction: RampDirection) => set({ activeDirection: direction }),
      reset: () => set({ activeDirection: defaultRampDirection })
    }),
    {
      migrate: (persistedState, version) => {
        if (version !== 2) {
          return null;
        }
        return persistedState;
      },
      name: "rampDirectionStore",
      version: 2
    }
  )
);

export const useRampDirection = () => useRampDirectionStore(state => state.activeDirection);
export const useRampDirectionToggle = () => useRampDirectionStore(state => state.onToggle);
export const useRampDirectionReset = () => useRampDirectionStore(state => state.reset);
