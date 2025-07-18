import { create } from "zustand";
import { persist } from "zustand/middleware";
import { RampDirection } from "../components/RampToggle";
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
      name: "rampDirectionStore"
    }
  )
);

export const useRampDirection = () => useRampDirectionStore(state => state.activeDirection);
export const useRampDirectionToggle = () => useRampDirectionStore(state => state.onToggle);
export const useRampDirectionReset = () => useRampDirectionStore(state => state.reset);
