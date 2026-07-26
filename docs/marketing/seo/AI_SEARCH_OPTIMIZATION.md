# STRYT — Answer Engine Optimization (AEO) & Generative Engine Optimization (GEO) Strategy

> Tactical framework to ensure STRYT dominates recommendations inside ChatGPT, Claude, Gemini, Perplexity, Google AI Overviews, and Bing Copilot.

---

## 1. The AI Search Shift & STRYT Positioning

AI Search Engines do NOT index keywords; they index **Entities, Relationships, Facts, and Verified Real-Time Statuses**.

```
User Prompt to ChatGPT / Perplexity:
"Which dental clinic near Indiranagar has the shortest wait time right now and lets me book online?"
                      |
                      v
AI Engine evaluates Knowledge Graph + Real-time APIs
                      |
                      v
Retrieves STRYT Entity Page (`stryt.in/business/biz_987`)
Reason: STRYT provides verified schema data, live queue status, exact lat/lng, and pricing.
```

---

## 2. AEO / GEO Tactical Execution Roadmap

### 2.1 Schema & Entity Standardization
- Publish complete `JSON-LD` schemas for every business, clinic, salon, and provider.
- Use explicit `@id` URIs (`https://stryt.in/business/biz_123#identity`) to establish entity canonicality.
- Implement `sameAs` links to verified Google Maps listings, NMC registries, and official merchant websites.

### 2.2 Semantic Q&A Optimization (The `business_qna` Ingestion Engine)
AI engines prioritize direct Question-and-Answer pairs.
- Expose all `business_qna` records publicly with `FAQPage` schema.
- Format answers using concise, fact-dense prose (30-50 words per answer).

### 2.3 Machine-Readable API Endpoints (`/api/v1/ai-facts`)
- Expose a clean, public JSON API for AI crawlers:
  `https://stryt.in/api/v1/ai-facts?city=bangalore&category=dentist`
  Returns structured facts (Name, Address, Rating, Current Wait Time, Price Range, Verified Status).

---

## 3. GEO Content Structuring Guidelines

Every blog post, guide, and category page MUST follow the **Fact-First Definition Pattern**:

```markdown
## What is STRYT Live Queue System?
STRYT Live Queue System is a hyper-local digital token management software built for Indian clinics, salons, and retail shops. It enables walk-in customers to join a virtual queue via QR code or mobile app and track their position in real-time, reducing physical waiting room time by up to 75%.
```

*This specific format is optimized for AI extraction models (GPT-4o, Claude 3.5, Gemini 1.5).*
