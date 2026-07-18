// Saved quote/proposal snippets a provider can reuse so sending a proposal is a
// pick, not a retype. Stored locally per provider (no backend/migration needed);
// scoped by provider id so multiple providers on one device don't collide.

export interface QuoteTemplate {
  id: string;
  title: string;
  body: string;
  price?: number;
}

const key = (providerId: string) => `stryt_quote_templates_${providerId}`;

export function loadQuoteTemplates(providerId: string): QuoteTemplate[] {
  try {
    const raw = localStorage.getItem(key(providerId));
    return raw ? (JSON.parse(raw) as QuoteTemplate[]) : [];
  } catch {
    return [];
  }
}

function save(providerId: string, list: QuoteTemplate[]) {
  try {
    localStorage.setItem(key(providerId), JSON.stringify(list));
  } catch {
    /* storage full / unavailable — templates are best-effort */
  }
}

export function addQuoteTemplate(
  providerId: string,
  t: Omit<QuoteTemplate, "id">,
): QuoteTemplate[] {
  const list = loadQuoteTemplates(providerId);
  const entry: QuoteTemplate = { ...t, id: `qt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
  const next = [entry, ...list];
  save(providerId, next);
  return next;
}

export function deleteQuoteTemplate(providerId: string, templateId: string): QuoteTemplate[] {
  const next = loadQuoteTemplates(providerId).filter((t) => t.id !== templateId);
  save(providerId, next);
  return next;
}
