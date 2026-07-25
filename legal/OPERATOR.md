# STRYT — Operator identity

**Edit [`operator.yaml`](operator.yaml)** (not this file), then publish:

```bash
node scripts/apply-legal-operator.mjs
```

That fills every `[STRYT OPERATOR LEGAL NAME]` / address / Grievance Officer
placeholder across `legal/*.md`, sets Effective Dates, removes draft banners,
and bumps `LEGAL_VERSION` in `src/lib/legal.ts` so signed-in users re-accept.

## Required fields

| Field | Why |
|---|---|
| `operator_legal_name` | App Store + IT Rules — who operates the app |
| `registered_address` | Postal contact / registered office |
| `grievance_officer_name` | Mandatory named India-based Grievance Officer |
| `grievance_officer_email` | Defaults to `contact@stryt.in` |
| `jurisdiction_city_state` | Terms governing law / arbitration seat |

Optional: `cin_or_registration`, `gstin`, `grievance_officer_phone`.

## URLs after publish

- In-app: `/legal/privacy-policy`
- Web / App Store Connect privacy URL: `https://stryt.in/legal/privacy-policy`
