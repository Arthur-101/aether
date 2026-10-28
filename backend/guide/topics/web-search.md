---
id: web-search
title: Web search
summary: Add a Tavily key, search the live web, and read pages directly.
tags: [web, search, tavily, fetch, internet]
related: [tools-and-approvals, privacy-and-local-first, troubleshooting]
order: 100
---
# Web search

The **Web** tool group has two tools:

- `web_search` — search the live web through Tavily.
- `fetch_url` — read a public HTTP or HTTPS page and return readable text.

Both are read-only. `fetch_url` does not need an API key.

## Add a Tavily key

1. Create a Tavily account and copy an API key.
2. Open Settings → **AI & Models**.
3. Paste the key into **Tavily web search API key**.
4. Click **Save & Apply**.

The key is stored locally. Without a key, `web_search` returns a clear error telling you to add one; it does not silently pretend there are no results.

## Search

Ask:

- “Search the web for the latest Windows 11 release notes.”
- “Find three comparisons of local LLM runtimes.”
- “What’s the current price of the Framework 13?”
- “Search for this error message and explain the top result.”

Aether returns a short synthesized answer with links. Search results are summaries and snippets, not a full crawl of every page. Open a link in your browser when you need the complete page.

## Read a page directly

Ask “Read this page and summarize it: https://…” or “Fetch this URL and pull out the system requirements.” `fetch_url` works on public pages without a Tavily key.

Pages that require a login, block automated requests, or return JavaScript-only content may fail or return incomplete text. The tool reports the failure instead of inventing content.

## Privacy and safety

- A `web_search` query is sent to Tavily.
- A `fetch_url` request goes directly to that website.
- Page text is treated as untrusted data. Instructions inside a page are not treated as commands from you.
- Search results can be outdated or wrong. For current or high-stakes facts, open the source and check it.

## Troubleshooting

- **“Web search needs a Tavily API key”** — add the key in AI & Models and save.
- **“Tavily rejected the API key”** — paste the key again; check for extra spaces.
- **HTTP 429 or quota errors** — wait or check your Tavily plan.
- **A page fails to load** — try the site’s main article URL, or open it in your browser.

If you do not want any web access, disable the **Web** group in Settings → Tools. Local chat, notes, media, and system tools continue to work.
