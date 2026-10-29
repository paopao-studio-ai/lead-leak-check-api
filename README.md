# Lead Leak Check API

An HTTP API that audits a **Zapier, Make or n8n lead pipeline** and returns a **0–100 leak-risk score** with ranked findings and fixes. Typical findings are no owner, no unanswered-lead alert, silent filters, a free-plan cap or failed runs.

- One Cloudflare Worker with **no dependencies, no storage and no outbound calls**.
- It is a line-for-line port of [`rules.py`](https://github.com/paopao-studio-ai/lead-leak-check-mcp/blob/main/src/lead_leak_check/rules.py) from the MCP server. A **parity test** checks it against Python output on 37 fixtures.
- Gateway-friendly: a shared-secret header, GET endpoints with query parameters for marketplaces that don't support request bodies, and no URLs in responses unless you turn them on.

Also available as an [MCP server](https://github.com/paopao-studio-ai/lead-leak-check-mcp) and an [Apify Actor](https://github.com/paopao-studio-ai/lead-leak-check-apify).

## Endpoints

| Method | Path | Input |
|---|---|---|
| GET | `/health` | Public |
| GET | `/openapi.json` | Public, OpenAPI 3.1 ([openapi.json](openapi.json)) |
| GET | `/v1/rules` | Lists the 15 rules |
| GET / POST | `/v1/check` | GET: `?config=<JSON string>`. POST: JSON body (the config itself or `{"config": {...}}`) |
| GET / POST | `/v1/check-description` | GET: `?text=`. POST: `{"text": "..."}` or `text/plain` |
| GET / POST | `/v1/analyze-history` | GET: `?csv=&expected_interval_minutes=`. POST: `{"csv": "...", "expected_interval_minutes": 30}` or `text/csv` |

Every `/v1/*` endpoint accepts `include_markdown=false` to drop the `report_markdown` field. Bodies over 1 MB get a 413.

```bash
curl -s "https://<worker>/v1/check-description?include_markdown=false" \
  -H "X-Origin-Key: $PROXY_SECRET" -H "Content-Type: application/json" \
  -d '{"text":"Typeform leads go to Google Sheets via Zapier on the free plan. Nobody is assigned. No error alerts."}'
```

```json
{
  "pipeline": "described pipeline",
  "risk_score": 81,
  "counts": { "high": 2, "medium": 1, "low": 0, "verify": 9 },
  "findings": [
    { "id": "no-owner", "severity": "high", "title": "Nobody owns the first reply", "why": "...", "fix": "...", "evidence": "" }
  ],
  "notes": ["Parsed from free text with keyword rules; send a JSON config (see /v1/check) for exact results.", "..."]
}
```

## Configuration

| Name | Kind | Default | Meaning |
|---|---|---|---|
| `PROXY_SECRET` | **secret** | none | Required. If it is unset, `/v1/*` returns 503 (fails closed). |
| `SECRET_HEADERS` | var | `x-rapidapi-proxy-secret,x-origin-key` | Header names that may carry the secret |
| `FOOTER_URL` | var | empty | Optional link in the Markdown footer. Keep it empty for Zyla, which forbids URLs. |
| `ALLOW_OPEN` | var | unset | `true` disables the secret check. For local testing only. |

## Deploy (free Workers plan)

**Option A: Cloudflare dashboard, no CLI or token**
1. Run `npm run build` (or use the committed `dist/worker.js`, a single file).
2. In dash.cloudflare.com go to **Workers & Pages → Create → Create Worker**, name it `lead-leak-check-api` and click **Deploy**.
3. Click **Edit code**, replace the contents of `worker.js` with all of [`dist/worker.js`](dist/worker.js), then click **Deploy**.
4. Under **Settings → Variables and Secrets → Add**, add a *Secret* named `PROXY_SECRET` with a long random string. Optionally add a *Text* `SECRET_HEADERS`. Click **Deploy**.
5. Check: `curl https://lead-leak-check-api.<subdomain>.workers.dev/health`, and confirm `/v1/rules` returns 401 without the header.

**Option B: wrangler (Node 22+)**
```bash
export CLOUDFLARE_API_TOKEN=...      # token with "Edit Cloudflare Workers" permission
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler deploy
npx wrangler secret put PROXY_SECRET  # paste the secret when prompted
```

## Develop

```bash
npm test                 # build + node:test (parity with Python + HTTP behaviour)
echo 'PROXY_SECRET=dev' > .dev.vars && npx wrangler dev
python scripts/gen_parity.py ../lead-leak-check-mcp/src > test/fixtures/parity.json   # regenerate fixtures
```

MIT license. Made by [Paopao Studio](https://paopao-studio.pages.dev/?utm_source=github&utm_medium=readme&utm_campaign=lead_leak_api).
