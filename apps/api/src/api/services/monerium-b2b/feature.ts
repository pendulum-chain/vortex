/** Pure startup decision kept testable without importing the side-effectful entrypoint. */
export function shouldStartMoneriumB2bWorker(flowVariant: string, enabled: boolean): boolean {
  return flowVariant === "mykobo" && enabled;
}
