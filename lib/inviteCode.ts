// Client-side memory of the invite code this device entered. The code is
// validated server-side on every story/voice request — this is just so the
// user only has to type it once.
const KEY = "roadlore.invite";

export function getInviteCode(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function saveInviteCode(code: string): void {
  try {
    window.localStorage.setItem(KEY, code.trim());
  } catch {
    /* localStorage unavailable — user will be asked again next visit */
  }
}

export function clearInviteCode(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
