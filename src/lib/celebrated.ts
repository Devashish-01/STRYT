/** True the first time it is asked for a given key on this device — so a celebration is a surprise, not a nag on every visit. */
export function firstTime(key: string): boolean {
  try {
    const k = `stryt:celebrated:${key}`;
    if (localStorage.getItem(k)) return false;
    localStorage.setItem(k, "1");
    return true;
  } catch {
    return false;
  }
}
