import { getEvmTokensLoadedSnapshot, subscribeEvmTokensLoaded } from "@vortexfi/shared";
import { useSyncExternalStore } from "react";

// The snapshot is a plain boolean read, so the same getter serves as the server snapshot —
// without one, prerendering the routes that call this throws "Missing getServerSnapshot".
export const useEvmTokensLoaded = (): boolean =>
  useSyncExternalStore(subscribeEvmTokensLoaded, getEvmTokensLoadedSnapshot, getEvmTokensLoadedSnapshot);
