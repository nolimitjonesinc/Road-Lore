// A stable per-browser id so stories and "what have I heard" tracking are
// scoped per device (until real accounts exist).
const KEY = "roadlore.device";

export function deviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(16).slice(2);
    window.localStorage.setItem(KEY, id);
  }
  return id;
}
