import { create } from 'zustand';
import { RampDirection } from '../components/RampToggle';

export const DEFAULT_RAMP_DIRECTION = RampDirection.ONRAMP;

export interface RampDirectionStore {
  activeDirection: RampDirection;
  onToggle: (direction: RampDirection) => void;
}

export const useRampDirectionStore = create<RampDirectionStore>((set) => ({
  activeDirection: DEFAULT_RAMP_DIRECTION,
  onToggle: (direction: RampDirection) => set({ activeDirection: direction }),
}));

export const useRampDirection = () => useRampDirectionStore((state) => state.activeDirection);
export const useRampDirectionToggle = () => useRampDirectionStore((state) => state.onToggle);
