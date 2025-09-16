import { fromPromise } from "xstate";

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export const decideInitialStateActor = fromPromise(async () => {
  // TODO: Implement logic to decide between Level 1 and Level 2
  await delay(10);
  return "Level1";
});
