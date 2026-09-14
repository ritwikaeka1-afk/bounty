export const IDLE_MS = 30 * 60 * 1000;
export const WARNING_MS = 2 * 60 * 1000;
type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

// A separate expiry marker prevents a late activity write from reviving logout.
export function createIdleClock(key: string, store: Store, now = Date.now) {
  const activityKey = `${key}:activity`, expiryKey = `${key}:expired`;
  const read = (k: string) => { try { return store.getItem(k); } catch { return null; } };
  const write = (k: string, value: string) => { try { store.setItem(k, value); } catch {} };
  const initial = Number(read(activityKey));
  let last = initial > 0 && initial <= now() ? initial : now();
  let expired = read(expiryKey) === "true";
  if (!initial) write(activityKey, String(last));
  function remaining() {
    const shared = Number(read(activityKey));
    if (shared > last && shared <= now()) last = shared;
    if (read(expiryKey) === "true") expired = true;
    return expired ? 0 : Math.max(0, IDLE_MS - (now() - last));
  }
  function expire() { expired = true; write(expiryKey, "true"); }
  function activity() {
    if (remaining() <= 0) { expire(); return false; }
    last = now(); write(activityKey, String(last)); return true;
  }
  function receive(timestamp: number) {
    if (!expired && timestamp > last && timestamp <= now()) last = timestamp;
  }
  return { remaining, expire, activity, receive, timestamp: () => last };
}
