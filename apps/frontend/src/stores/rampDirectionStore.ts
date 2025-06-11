import { create } from 'zustand';
import { RampDirection } from '../components/RampToggle';
import { getRampDirectionFromPath } from '../helpers/path';

const defaultRampDirection = getRampDirectionFromPath();

export interface RampDirectionStore {
  activeDirection: RampDirection;
  onToggle: (direction: RampDirection) => void;
}

export const useRampDirectionStore = create<RampDirectionStore>((set) => ({
  activeDirection: defaultRampDirection,
  onToggle: (direction: RampDirection) => set({ activeDirection: direction }),
}));

export const useRampDirection = () => useRampDirectionStore((state) => state.activeDirection);
export const useRampDirectionToggle = () => useRampDirectionStore((state) => state.onToggle);
