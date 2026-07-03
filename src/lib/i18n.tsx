import { createContext, useContext, useState, type ReactNode } from "react";

export type Lang = "en" | "hi" | "mr";

const strings: Record<Lang, Record<string, string>> = {
  en: {
    home: "Home",
    explore: "Explore",
    requests: "Requests",
    community: "Community",
    profile: "Profile",
    post_request: "Post a request",
    what_do_you_need: "What do you need?",
    category: "Category",
    details: "Details",
    budget: "Budget",
    needed_by: "Needed by",
    urgent: "Mark as urgent",
    recurring: "Recurring need",
    anonymous: "Post anonymously",
    post: "Post request",
    posting: "Posting…",
    my_agreements: "My Agreements",
    active: "Active",
    completed: "Completed",
    disputed: "Disputed",
    pending: "Pending",
    cancelled: "Cancelled",
    confirm: "Confirm",
    dispute: "Raise dispute",
    complete: "Mark complete",
    pay_online: "Pay online",
    pay_offline: "Mark paid offline",
    society: "My Society",
    subscriptions: "Subscriptions",
    add_subscription: "Add recurring service",
    present: "Present",
    absent: "Absent",
    skipped: "Skipped",
    settings: "Settings",
    language: "Language",
    notifications: "Notifications",
    sign_out: "Sign out",
    map: "Map",
    create: "Create",
    appointments: "Appointments",
    badges: "Badges",
    heroes: "Heroes",
  },
  hi: {
    home: "होम",
    explore: "खोजें",
    requests: "अनुरोध",
    community: "समुदाय",
    profile: "प्रोफ़ाइल",
    post_request: "अनुरोध करें",
    what_do_you_need: "आपको क्या चाहिए?",
    category: "श्रेणी",
    details: "विवरण",
    budget: "बजट",
    needed_by: "कब चाहिए",
    urgent: "अर्जेंट करें",
    recurring: "नियमित जरूरत",
    anonymous: "अनजान रहकर पोस्ट करें",
    post: "पोस्ट करें",
    posting: "पोस्ट हो रहा है…",
    my_agreements: "मेरे समझौते",
    active: "सक्रिय",
    completed: "पूर्ण",
    disputed: "विवादित",
    pending: "लंबित",
    cancelled: "रद्द",
    confirm: "पुष्टि करें",
    dispute: "विवाद दर्ज करें",
    complete: "पूर्ण करें",
    pay_online: "ऑनलाइन भुगतान",
    pay_offline: "नकद भुगतान दर्ज करें",
    society: "मेरी सोसाइटी",
    subscriptions: "नियमित सेवाएं",
    add_subscription: "नई सेवा जोड़ें",
    present: "उपस्थित",
    absent: "अनुपस्थित",
    skipped: "छोड़ा",
    settings: "सेटिंग्स",
    language: "भाषा",
    notifications: "सूचनाएं",
    sign_out: "साइन आउट",
    map: "नक्शा",
    create: "बनाएं",
    appointments: "नियुक्तियां",
    badges: "बैज",
    heroes: "नायक",
  },
  mr: {
    home: "मुखपृष्ठ",
    explore: "शोधा",
    requests: "विनंत्या",
    community: "समुदाय",
    profile: "प्रोफाइल",
    post_request: "विनंती करा",
    what_do_you_need: "तुम्हाला काय हवे आहे?",
    category: "श्रेणी",
    details: "तपशील",
    budget: "बजेट",
    needed_by: "कधी हवे",
    urgent: "तातडीचे करा",
    recurring: "नियमित गरज",
    anonymous: "अनामिकपणे पोस्ट करा",
    post: "पोस्ट करा",
    posting: "पोस्ट होत आहे…",
    my_agreements: "माझे करार",
    active: "सक्रिय",
    completed: "पूर्ण",
    disputed: "वादग्रस्त",
    pending: "प्रलंबित",
    cancelled: "रद्द",
    confirm: "पुष्टी करा",
    dispute: "वाद नोंदवा",
    complete: "पूर्ण करा",
    pay_online: "ऑनलाइन पैसे द्या",
    pay_offline: "रोख पेमेंट नोंदवा",
    society: "माझी सोसायटी",
    subscriptions: "नियमित सेवा",
    add_subscription: "नवीन सेवा जोडा",
    present: "उपस्थित",
    absent: "अनुपस्थित",
    skipped: "वगळले",
    settings: "सेटिंग्ज",
    language: "भाषा",
    notifications: "सूचना",
    sign_out: "साइन आउट",
    map: "नकाशा",
    create: "तयार करा",
    appointments: "भेटी",
    badges: "बॅज",
    heroes: "हिरो",
  },
};

interface I18nCtx { lang: Lang; t: (key: string) => string; setLang: (l: Lang) => void; }
const Ctx = createContext<I18nCtx>({ lang: "en", t: (k) => k, setLang: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("naya_lang") as Lang | null;
    return saved && ["en", "hi", "mr"].includes(saved) ? saved : "en";
  });

  function changeLang(l: Lang) {
    setLang(l);
    localStorage.setItem("naya_lang", l);
  }

  function t(key: string): string {
    return strings[lang][key] ?? strings["en"][key] ?? key;
  }

  return <Ctx.Provider value={{ lang, t, setLang: changeLang }}>{children}</Ctx.Provider>;
}

export function useI18n() { return useContext(Ctx); }

export const LANG_LABELS: Record<Lang, string> = { en: "English", hi: "हिन्दी", mr: "मराठी" };
