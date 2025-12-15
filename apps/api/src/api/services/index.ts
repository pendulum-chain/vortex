import NodeCache from "node-cache";

export const cache = new NodeCache({
  checkperiod: 120,
  maxKeys: 1000,
  stdTTL: 600
});
