/**
 * Call a function the APP supplied, without letting it break ours.
 *
 * Contributor notes (not rendered):
 *
 * Every callback on a session — `onError`, `onFieldValue`, `onStateChange`, a `subscribe`
 * listener — is written by the app, runs inside our control flow, and can throw for reasons
 * that have nothing to do with the session. Unguarded, three things went wrong, each found by
 * reading rather than by a failing test:
 *
 * 1. **A throwing `subscribe` listener aborted the notify loop**, so every listener registered
 *    after it silently stopped receiving state. A framework binding and an app's own
 *    `subscribe()` routinely coexist, so this was real data loss with no symptom.
 * 2. **A throwing `onError` replaced the rejection** from `start()`: `failWith` reports and then
 *    returns the value `start()` throws, so the app saw its own handler's bug instead of the
 *    failure it was handling. The state stayed correct, which made it worse — the two sources
 *    disagreed.
 * 3. A throwing `onFieldValue` escaped into a WebSocket `message` handler, where the browser
 *    reports it and carries on, so the SDK never learned and the app got no signal either.
 *
 * **Why it re-throws asynchronously instead of swallowing.** Swallowing would make the app's own
 * bug invisible — a `console.log` typo in a callback would vanish, which is its own trap. Throwing
 * on a fresh task takes it out of our stack (so our control flow is unaffected) and puts it where
 * an unhandled error belongs: `window.onerror`, and whatever error reporting the app has wired to
 * it. The app sees its bug; the session keeps running.
 *
 * Deliberately not exported from the package: this is how the SDK calls out, not something an
 * app needs.
 *
 * @internal
 */
export function safely(run: () => void): void {
  try {
    run();
  } catch (e) {
    // A fresh task, so this cannot unwind whatever the SDK was in the middle of.
    setTimeout(() => {
      throw e;
    }, 0);
  }
}
