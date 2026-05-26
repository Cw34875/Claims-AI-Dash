# AI Claims Assistant

A revenue cycle management tool that helps billing teams triage, analyze, and act on denied, rejected, and underpaid claims using AI-powered analysis.

---

## Running locally

### Prerequisites

- Node.js 18+ (the project uses ESM and modern TS features)
- An Anthropic API key

### Setup

```bash
# Install dependencies
npm install

# Add your API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

### Start

```bash
npm run dev
```

This runs both servers concurrently:

| Server | URL | Purpose |
|--------|-----|---------|
| Vite (frontend) | http://localhost:5173 | React UI with HMR |
| Express (API) | http://localhost:3001 | Claude API proxy, caching, claim data |

Open http://localhost:5173 in your browser.

### Build for production

```bash
npm run build    # type-check + Vite bundle → dist/
npm run preview  # serve dist/ locally
```

---

## Architecture

### Priority-first triage

The top bar groups claims into **High / Medium / Low** priority bands using a weighted score (urgency 55%, recoverability 45%). Urgency is derived from days to filing deadline; recoverability from billed-minus-paid amount. Status filtering (Denied / Rejected / Underpaid / Pending / Skipped) lives in the sidebar as multi-select checkboxes so both dimensions are independently filterable.

**Tradeoff:** The priority weights are hardcoded. Orgs with different risk profiles would want these tunable — e.g. a high-volume low-dollar practice weights urgency more heavily than a low-volume high-dollar specialist.

---

### Three-tier AI analysis

Analysis is split across three tiers with intentionally different cost and latency profiles:

**Tier 1 — Deterministic clustering** (`src/utils/clusters.ts`)
Groups by `(payerFamily, denialCode)` and computes stats: overdue count, urgent count, top CPT codes, submission date range, sample denial reasons. Zero cost, runs instantly in the browser, provides the structured input for Tier 2.

**Tier 2 — Cluster-level pattern analysis** (`/api/analyze-cluster`)
Sends a compact ~400-token cluster summary to Claude — not raw claim objects — and asks for root cause and batch action recommendation. A cluster of 50 claims costs roughly the same token-wise as one individual review. Results appear inline in each cluster header as an insight card with confidence rating.

**Tier 3 — Individual claim proposals** (`/api/batch-review`, `/api/review`)
Full claim detail → structured field corrections via `generateObject`. Pre-loaded in 10-claim background chunks as the user works through the queue. Chat can also trigger individual proposals via the `editClaim` tool.

---

### 24-hour server-side cache

All AI results are cached in-memory with key format `prefix::id::YYYY-MM-DD`. The date suffix provides automatic daily expiry without any TTL logic or cleanup — a key from yesterday is simply never found. Applied to both individual claim reviews and cluster analyses, with partial-hit support in batch review (only uncached claims are sent to Claude).

**Tradeoff:** Cache doesn't survive server restart. The `cacheGet`/`cacheSet` interface is thin enough to swap for Redis or a file-based store without touching call sites.

---

### Batch apply workflow

In Cluster view, each cluster header has a **Batch Apply** button. Opening it triggers `useBatchCluster`, which checks which claims already have proposals in session state and fetches only the remainder in 10-claim chunks via the cached `/api/batch-review` endpoint. Results are written to central session state as each chunk arrives, so they're available for individual review too.

The panel detects whether all proposals share the same `recommendedAction` and surfaces a green (uniform) or amber (mixed) callout. On confirm, all selected claims are marked `submitted` with field edits set to `accepted`.

**Tradeoff:** Batch apply auto-accepts all field edits without per-edit review. For high-confidence uniform clusters this is the right default. For mixed clusters the warning nudges toward individual review, but it's still a one-click override — which may be too permissive for high-value claims.

---

### Chat `editClaim` tool

The chat interface exposes an `editClaim` tool that proposes structured field edits in response to natural-language instructions (e.g. "add modifier 25 to line 1"). Edits appear as pending suggestions in the same UI as AI-generated proposals. The user accepts or rejects each individually before anything is saved, keeping the chat interface strictly advisory.

---

## Limitations

**In-memory cache only.** AI batch responses are stored in a plain JS `Map` on the Express process. The cache is lost on every server restart, and won't work in a multi-instance deployment. See *Future work* below for the Redis path.

**No authentication or access control.** All API endpoints are unauthenticated. Any process that can reach port 3001 can read claim data and trigger AI calls. This is acceptable for local use but must be addressed before any shared or production deployment.

**Claims data is static JSON.** `claims.json` is loaded once at startup from disk. There is no live data source, persistence of accepted edits, or write-back to any system of record. Accepted field edits exist only in browser session state.

**AI proposals are advisory only.** Accepted edits update local UI state but are never submitted to a payer or written to a database. The "submit" action is a stub — the workflow stops at the UI.

**Batch review is capped at 10 claims.** The `/api/batch-review` endpoint sends at most 10 claims per `generateObject` call to keep prompt size and latency manageable. Claims beyond the cap fall back to individual on-demand fetch.

**No document upload or OCR.** The UI has a file attachment affordance on the claim detail panel, but attached files are not sent to the AI or parsed. Medical records, EOBs, and auth letters must be referenced manually.

---

## Future work

**Redis cache for AI responses.** Replace the in-memory `Map` with Redis so batch proposal results survive server restarts and are shared across multiple API instances. The `cacheGet` / `cacheSet` interface is already thin enough to swap without touching call sites. Suggested key format: `claim-review::{claimId}::{YYYY-MM-DD}` with a 24-hour TTL.

**Authentication and role-based access.** Add session-based auth (e.g. NextAuth or a lightweight JWT middleware) with at minimum two roles: *reviewer* (read + propose) and *manager* (approve batch apply, override write-offs). Claim data and AI endpoints should require a valid session.

**AI review of uploaded documents.** Pass attached files (EOBs, medical records, auth letters) to Claude using the Files API. The review prompt would include document contents alongside the structured claim data, allowing the AI to cross-reference billed codes against clinical notes and flag discrepancies automatically.

**GraphQL retrieval of claims data.** Replace the static `claims.json` load with a GraphQL client. A GraphQL layer over the claims database enables field-level querying (fetch only `claimId`, `status`, `denialCode` for the list view; full detail only when a claim is opened), real-time subscriptions for status updates, and a clean boundary between the UI and the system of record.

---

## Project structure

```
server.ts                        Express API server (Claude proxy, cache, claim tools)
src/
  types/index.ts                 Shared types (Claim, Cluster, AiProposal, Filters…)
  utils/
    clusters.ts                  Deterministic cluster building + stats
    filters.ts                   Filter application logic
    priority.ts                  Priority score computation
    proposals.ts                 mapToProposal — shared between batch hooks
  hooks/
    useClaimsState.ts            Central session state (proposals, actions, edits)
    useFilters.ts                Sidebar filter state
    useBatchProposals.ts         Background pre-load of proposals for visible claims
    useBatchCluster.ts           On-demand proposal fetch for all claims in a cluster
    useClusterAnalysis.ts        Auto-fetch cluster-level pattern analysis
    useAutoProposal.ts           Fallback single-claim proposal fetch
  components/
    claims/
      ClaimsWorkspace.tsx        Top-level layout + state wiring
      StatusTabs.tsx             Priority bar (High / Med / Low)
      list/
        ClusterView.tsx          Cluster mode list
        ClusterGroup.tsx         Per-cluster row with AI insight card
        BatchReviewPanel.tsx     Batch apply modal
        SweepView.tsx            Flat sweep mode list
      detail/                    Individual claim detail panel
    layout/
      FilterSidebar.tsx          Status + payer + denial code + deadline filters
      ChatPanel.tsx              Streaming chat with tool use
```
