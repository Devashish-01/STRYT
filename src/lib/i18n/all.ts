// All three languages together. For tests only — the app imports src/lib/i18n.tsx, which loads Hindi and Marathi on
// demand; importing this file from app code would put every language back into the first page load.
import en from "./en";
import hi from "./hi";
import mr from "./mr";
import type { Lang } from "../i18n";

export const translations: Record<Lang, Record<string, string>> = { en, hi, mr };
