// Remembers the page a logged-out user tried to open (e.g. a shared /map link)
// so we can send them back there after they sign in, instead of dumping them on
// /home. Persists in sessionStorage because the Google OAuth round-trip is a full
// page reload that wipes in-memory + React Router state.

const KEY = "stryt_return_to";

function isMeaningful(path: string): boolean {
  if (!path) return false;
  if (path === "/" || path === "/home") return false;
  if (path.startsWith("/auth")) return false;
  return true;
}

export const returnTo = {
  // Save where the user wanted to go (no-op for auth/home/root).
  remember(path: string) {
    if (isMeaningful(path)) sessionStorage.setItem(KEY, path);
  },
  // Read + clear. Returns "/home" as the safe default.
  consume(): string {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v && isMeaningful(v) ? v : "/home";
  },
  // Read without clearing (used to build the OAuth redirect URL).
  peek(): string | null {
    return sessionStorage.getItem(KEY);
  },
};
