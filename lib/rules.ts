export const MAX_REWARD = 100000;
export function parseReward(value: string): number {
  if (!/^\d+$/.test(value.trim())) throw new Error("Enter a whole number of credits.");
  const reward = Number(value);
  if (!Number.isSafeInteger(reward) || reward < 1 || reward > MAX_REWARD)
    throw new Error(`Choose between 1 and ${MAX_REWARD.toLocaleString()} credits.`);
  return reward;
}
export function safeReturn(value: string | null): string {
  if (!value || !value.startsWith("/?") || /[\\\r\n]/.test(value)) return "/?view=tasks";
  return value;
}
export function publicName(first: string, last: string, preferred = ""): string {
  return preferred.trim() || [first.trim(), last.trim() ? `${Array.from(last.trim())[0]}.` : ""].filter(Boolean).join(" ");
}
export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Something went wrong. Please try again.";
}
export const formatDate = (date: string | null) => date
  ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(date))
  : "Flexible timing";
