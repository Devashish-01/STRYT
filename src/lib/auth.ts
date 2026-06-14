// Token storage with localStorage persistence. The real backend issues these;
// in mock mode we mint fake tokens so the guard + refresh flow still exercises.

const ACCESS_KEY = "naya_access";
const REFRESH_KEY = "naya_refresh";

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
  get isAuthed() {
    return !!localStorage.getItem(ACCESS_KEY);
  },
};

export function mintMockTokens() {
  tokenStore.set("mock_access_" + Date.now(), "mock_refresh_" + Date.now());
}
