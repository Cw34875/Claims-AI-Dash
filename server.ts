import express from 'express';
import cors from 'cors';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { streamText, convertToModelMessages, tool, zodSchema, stepCountIs, generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import type { EnrichedClaim } from './src/types/index.js';

// Read API key directly from .env to avoid shell environment overrides
const envContent = readFileSync(new URL('.env', import.meta.url), 'utf-8');
const apiKey = envContent.match(/ANTHROPIC_API_KEY=(.+)/)?.[1]?.trim() ?? '';
const anthropic = createAnthropic({ apiKey, baseURL: 'https://api.anthropic.com/v1' });

const require = createRequire(import.meta.url);
const rawClaims: EnrichedClaim[] = require('./claims.json');

// ── Priority helpers (inline so server is self-contained) ──────────────────
const PAYER_FAMILIES: Record<string, string> = {
  'Blue Cross Blue Shield of Illinois': 'BCBS',
  'Blue Cross Blue Shield of Texas': 'BCBS',
  'Blue Cross Blue Shield of Georgia': 'BCBS',
  Aetna: 'Aetna',
  'Aetna HMO': 'Aetna',
  UnitedHealthcare: 'UnitedHealthcare',
  Cigna: 'Cigna',
  'Cigna PPO': 'Cigna',
  'Humana Gold Plus': 'Humana',
  'Humana Choice PPO': 'Humana',
  'Anthem Blue Cross': 'Anthem',
  'Medicare Part B': 'Medicare',
};

function normalizePayerFamily(name: string): string {
  return PAYER_FAMILIES[name] ?? name;
}

function computeRecoverability(c: EnrichedClaim): number {
  if (c.status === 'underpaid') return (c.totalAllowedAmount ?? 0) - c.totalPaidAmount;
  return c.totalBilledAmount - c.totalPaidAmount;
}

function computeDeadlineDays(c: EnrichedClaim): number | null {
  if (!c.filingDeadline) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = new Date(c.filingDeadline).getTime() - now.getTime();
  return Math.floor(diff / 86400000);
}

function urgencyScore(days: number | null): number {
  if (days === null) return 5;
  if (days <= 7) return 100;
  if (days <= 14) return 80;
  if (days <= 30) return 60;
  return 40;
}

function recScore(rec: number): number {
  return Math.min(100, (Math.log(rec + 1) / Math.log(15001)) * 100);
}

function priorityScore(u: number, r: number): number {
  return u * 0.55 + r * 0.45;
}

// Enrich all claims once
const allClaims = rawClaims.map((c) => {
  const rec = computeRecoverability(c);
  const days = computeDeadlineDays(c);
  const us = urgencyScore(days);
  const rs = recScore(rec);
  const ps = priorityScore(us, rs);
  return { ...c, recoverability: rec, deadlineDays: days, priorityScore: ps, payerFamily: normalizePayerFamily(c.payer.name) };
});

function fmt$(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

// ── System prompt builder ──────────────────────────────────────────────────
function buildSystemPrompt(selectedClaimId?: string): string {
  const byStatus = { denied: 0, rejected: 0, underpaid: 0, pending: 0 };
  let totalAtRisk = 0;
  let urgentCount = 0;
  for (const c of allClaims) {
    byStatus[c.status as keyof typeof byStatus]++;
    totalAtRisk += (c as unknown as { recoverability: number }).recoverability;
    const days = (c as unknown as { deadlineDays: number | null }).deadlineDays;
    if (days !== null && days <= 7) urgentCount++;
  }

  let base = `You are a medical billing assistant helping a revenue cycle team work their claims queue.

QUEUE SUMMARY (${allClaims.length} total claims):
- Denied: ${byStatus.denied} | Rejected: ${byStatus.rejected} | Underpaid: ${byStatus.underpaid} | Pending: ${byStatus.pending}
- Total at risk: ${fmt$(totalAtRisk)}
- Urgent (≤7 days to deadline): ${urgentCount} claims

PROPOSING EDITS: When the user asks you to change a claim field (modifier, CPT code, units, billed amount), use the editClaim tool to propose the change. Edits appear as pending suggestions in the UI — the user reviews and accepts or rejects each one before saving. Always confirm what you proposed after calling the tool.

RESPONSE STYLE: Keep every reply to 1-3 sentences. Use bullet points only when listing 3+ items. No preamble, no summaries, no restating the question — just the answer.`;

  if (selectedClaimId) {
    const claim = allClaims.find((c) => c.claimId === selectedClaimId);
    if (claim) {
      const days = (claim as unknown as { deadlineDays: number | null }).deadlineDays;
      const rec = (claim as unknown as { recoverability: number }).recoverability;
      base += `

CURRENTLY FOCUSED CLAIM: ${claim.claimId}
- Patient: ${claim.patient.name} | Payer: ${claim.payer.name}
- Status: ${claim.status.toUpperCase()} | Denial: ${claim.denialCode ?? 'N/A'} — ${claim.denialReason ?? 'N/A'}
- Billed: ${fmt$(claim.totalBilledAmount)} | At risk: ${fmt$(rec)}
- Deadline: ${days !== null ? `${days} days` : 'none'}
- Payer notes: ${claim.payerNotes ?? 'none'}
- Service lines (use zero-based lineIndex when calling editClaim):
${claim.lineItems.map((li, i) => `  [${i}] CPT ${li.cptCode}${li.modifier ? ` mod ${li.modifier}` : ''} × ${li.units} — $${li.billedAmount}`).join('\n')}`;
    }
  }

  return base;
}

// ── Tools ──────────────────────────────────────────────────────────────────
const listClaimsTool = tool({
  description:
    'Fetch the claims queue sorted by filing deadline (soonest first) then by recoverability (highest first). Use this proactively to identify what to work on next — no need for the user to name specific claims.',
  inputSchema: zodSchema(
    z.object({
      status: z.enum(['denied', 'rejected', 'underpaid', 'pending', 'all']).optional()
        .describe('Filter by claim status. Omit or use "all" for the full queue.'),
      includeExpired: z.boolean().optional()
        .describe('If true, include claims whose filing deadline has already passed (deadlineDays < 0). Defaults to false — expired claims are excluded by default.'),
      denialCode: z.string().optional()
        .describe('Filter to a specific denial/rejection code, e.g. "CO-4", "PR-96".'),
      providerName: z.string().optional()
        .describe('Filter by provider name (case-insensitive partial match).'),
      cptCode: z.string().optional()
        .describe('Filter to claims containing a specific CPT procedure code on any line item.'),
      payerName: z.string().optional()
        .describe('Filter by payer name (case-insensitive partial match, also matches payer family e.g. "BCBS").'),
      start: z.number().int().min(0).optional()
        .describe('Zero-based offset for pagination (default 0). Use with limit to page through results.'),
      limit: z.number().int().min(1).max(50).optional()
        .describe('Max claims to return (default 10).'),
    })
  ),
  execute: async ({ status, includeExpired = false, denialCode, providerName, cptCode, payerName, start = 0, limit = 10 }) => {
    let claims = [...allClaims];

    if (status && status !== 'all') claims = claims.filter((c) => c.status === status);

    if (!includeExpired) {
      claims = claims.filter((c) => {
        const days = (c as unknown as { deadlineDays: number | null }).deadlineDays;
        return days === null || days >= 0;
      });
    }

    if (denialCode) claims = claims.filter((c) => c.denialCode === denialCode);

    if (providerName) {
      const q = providerName.toLowerCase();
      claims = claims.filter((c) => c.provider.name.toLowerCase().includes(q));
    }

    if (cptCode) claims = claims.filter((c) => c.lineItems.some((li) => li.cptCode === cptCode));

    if (payerName) {
      const q = payerName.toLowerCase();
      const fam = normalizePayerFamily(payerName);
      claims = claims.filter(
        (c) =>
          c.payer.name.toLowerCase().includes(q) ||
          (c as unknown as { payerFamily: string }).payerFamily === fam
      );
    }

    // Sort: soonest deadline first (null → last), then highest recoverability
    claims.sort((a, b) => {
      const da = (a as unknown as { deadlineDays: number | null }).deadlineDays;
      const db = (b as unknown as { deadlineDays: number | null }).deadlineDays;
      if (da === null && db === null)
        return (b as unknown as { recoverability: number }).recoverability - (a as unknown as { recoverability: number }).recoverability;
      if (da === null) return 1;
      if (db === null) return -1;
      if (da !== db) return da - db;
      return (b as unknown as { recoverability: number }).recoverability - (a as unknown as { recoverability: number }).recoverability;
    });

    const filtered = claims.slice(start, start + limit);
    return {
      total: claims.length,
      start,
      returned: filtered.length,
      hasMore: start + limit < claims.length,
      filtersApplied: { status, includeExpired, denialCode, providerName, cptCode, payerName },
      claims: filtered.map((c) => ({
        claimId: c.claimId,
        patient: c.patient.name,
        provider: c.provider.name,
        payer: c.payer.name,
        status: c.status,
        denialCode: c.denialCode ?? null,
        denialReason: c.denialReason ?? null,
        filingDeadline: c.filingDeadline ?? null,
        deadlineDays: (c as unknown as { deadlineDays: number | null }).deadlineDays,
        recoverability: (c as unknown as { recoverability: number }).recoverability,
        totalBilledAmount: c.totalBilledAmount,
        totalAllowedAmount: c.totalAllowedAmount ?? null,
        totalPaidAmount: c.totalPaidAmount,
      })),
    };
  },
});

const analyzeClaimTool = tool({
  description: 'Retrieve full claim data to analyze and generate an appeal recommendation.',
  inputSchema: zodSchema(
    z.object({
      claimId: z.string().describe('The claim ID to analyze, e.g. CLM-1001'),
      focusArea: z.string().optional().describe('Optional specific area to focus on'),
    })
  ),
  execute: async ({ claimId }) => {
    const claim = allClaims.find((c) => c.claimId === claimId);
    if (!claim) return { error: `Claim ${claimId} not found` };
    return {
      claim: {
        claimId: claim.claimId,
        patient: claim.patient,
        provider: claim.provider,
        payer: claim.payer,
        dateOfService: claim.dateOfService,
        status: claim.status,
        denialCode: claim.denialCode,
        denialReason: claim.denialReason,
        payerNotes: claim.payerNotes,
        lineItems: claim.lineItems,
        totalBilledAmount: claim.totalBilledAmount,
        totalAllowedAmount: claim.totalAllowedAmount,
        totalPaidAmount: claim.totalPaidAmount,
        recoverability: (claim as unknown as { recoverability: number }).recoverability,
        deadlineDays: (claim as unknown as { deadlineDays: number | null }).deadlineDays,
        priorActions: claim.priorActions,
        filingDeadline: claim.filingDeadline,
      },
    };
  },
});

const searchSimilarClaimsTool = tool({
  description: 'Find similar claims by denial code, payer, or CPT code.',
  inputSchema: zodSchema(
    z.object({
      denialCode: z.string().optional(),
      payerName: z.string().optional(),
      cptCode: z.string().optional(),
      excludeClaimId: z.string().optional(),
    })
  ),
  execute: async ({ denialCode, payerName, cptCode, excludeClaimId }) => {
    let matches = allClaims.filter((c) => c.claimId !== excludeClaimId);
    if (denialCode) matches = matches.filter((c) => c.denialCode === denialCode);
    if (payerName) {
      const fam = normalizePayerFamily(payerName);
      matches = matches.filter((c) => (c as unknown as { payerFamily: string }).payerFamily === fam || c.payer.name.toLowerCase().includes(payerName.toLowerCase()));
    }
    if (cptCode) matches = matches.filter((c) => c.lineItems.some((li) => li.cptCode === cptCode));
    const totalRecoverability = matches.reduce((s, c) => s + (c as unknown as { recoverability: number }).recoverability, 0);
    return {
      count: matches.length,
      totalRecoverability,
      claims: matches.slice(0, 8).map((c) => ({
        claimId: c.claimId,
        patient: c.patient.name,
        payer: c.payer.name,
        status: c.status,
        denialCode: c.denialCode,
        recoverability: (c as unknown as { recoverability: number }).recoverability,
        deadlineDays: (c as unknown as { deadlineDays: number | null }).deadlineDays,
      })),
    };
  },
});

const draftCorrespondenceTool = tool({
  description: 'Generate a draft letter for appeal, peer-to-peer, reconsideration, or COB update.',
  inputSchema: zodSchema(
    z.object({
      claimId: z.string(),
      correspondenceType: z.enum(['appeal_letter', 'peer_to_peer_request', 'reconsideration_letter', 'cob_update']),
      additionalContext: z.string().optional(),
    })
  ),
  execute: async ({ claimId, correspondenceType, additionalContext }) => {
    const claim = allClaims.find((c) => c.claimId === claimId);
    if (!claim) return { error: `Claim ${claimId} not found` };
    return {
      claimId,
      correspondenceType,
      additionalContext,
      claimContext: {
        claimId: claim.claimId,
        patient: claim.patient,
        provider: claim.provider,
        payer: claim.payer,
        dateOfService: claim.dateOfService,
        status: claim.status,
        denialCode: claim.denialCode,
        denialReason: claim.denialReason,
        payerNotes: claim.payerNotes,
        lineItems: claim.lineItems,
        totalBilledAmount: claim.totalBilledAmount,
        priorActions: claim.priorActions,
        filingDeadline: claim.filingDeadline,
      },
    };
  },
});

const editClaimTool = tool({
  description:
    'Propose pending edits to a claim\'s service lines (modifier, CPT code, units, billed amount). Edits appear as suggestions in the UI — the user reviews and accepts or rejects each before saving. Use this when the user explicitly asks you to change or add something to the current claim.',
  inputSchema: zodSchema(
    z.object({
      claimId: z.string().describe('The claim ID to edit'),
      reasoning: z.string().describe('Why these changes are needed (keep under 400 chars)'),
      recommendedAction: z.string().describe('Brief label, e.g. "Add modifier 25 to Line 1" (keep under 100 chars)'),
      confidence: z.enum(['high', 'medium', 'low']),
      lineItemEdits: z.array(
        z.object({
          lineIndex: z.number().int().min(0).describe('Zero-based index of the service line to edit'),
          cptCode: z.string().optional().describe('New CPT code if changing'),
          modifier: z.string().regex(/^[A-Z0-9]{2}$/).nullable().optional()
            .describe('New 2-char modifier (null to remove) if changing'),
          units: z.number().int().min(1).optional().describe('New unit count if changing'),
          billedAmount: z.number().positive().optional().describe('New billed amount if changing'),
          rationale: z.string().describe('One sentence: billing rule or payer policy requiring this change (keep under 200 chars)'),
          confidence: z.enum(['high', 'medium', 'low']),
        })
      ).min(1).max(10),
    })
  ),
  execute: async ({ claimId, reasoning, recommendedAction, confidence, lineItemEdits }) => {
    const claim = allClaims.find((c) => c.claimId === claimId);
    if (!claim) return { error: `Claim ${claimId} not found` };

    const lineItemCorrections = lineItemEdits.flatMap((edit) => {
      const li = claim.lineItems[edit.lineIndex];
      if (!li) return [];
      const correction: Record<string, unknown> = {
        lineIndex: edit.lineIndex,
        rationale: edit.rationale,
        confidence: edit.confidence,
      };
      if (edit.cptCode !== undefined) correction.cptCode = { current: li.cptCode, proposed: edit.cptCode };
      if (edit.modifier !== undefined) correction.modifier = { current: li.modifier ?? null, proposed: edit.modifier };
      if (edit.units !== undefined) correction.units = { current: li.units, proposed: edit.units };
      if (edit.billedAmount !== undefined) correction.billedAmount = { current: li.billedAmount, proposed: edit.billedAmount };
      return [correction];
    });

    return { claimId, reasoning, recommendedAction, confidence, shouldFillClaim: false, lineItemCorrections };
  },
});

// ── 24-hour in-memory cache ────────────────────────────────────────────────
// Key format: `<prefix>::<id>::<YYYY-MM-DD>` — the date component means every
// entry automatically becomes stale at midnight without any cleanup needed.
const aiCache = new Map<string, unknown>();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function cacheKey(prefix: string, id: string): string {
  return `${prefix}::${id}::${todayStr()}`;
}

function cacheGet<T>(key: string): T | null {
  return (aiCache.get(key) as T | undefined) ?? null;
}

function cacheSet(key: string, value: unknown): void {
  aiCache.set(key, value);
}

// ── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, claimContext } = req.body as { messages: unknown[]; claimContext?: string };

    // Ensure every message has `parts` — convertToModelMessages calls parts.map()
    // with no guard and will crash if a message arrives without it (e.g. older
    // useChat format that only sets `content` as a string).
    type RawMsg = { role?: string; content?: string; parts?: unknown[] };
    const safeMessages = (Array.isArray(messages) ? messages : []).map((m) => {
      const msg = m as RawMsg;
      if (!Array.isArray(msg.parts)) {
        return { ...msg, parts: msg.content ? [{ type: 'text', text: msg.content }] : [] };
      }
      return msg;
    });

    const modelMessages = await convertToModelMessages(safeMessages as Parameters<typeof convertToModelMessages>[0]);

    const result = streamText({
      model: anthropic('claude-sonnet-4-6'),
      system: buildSystemPrompt(claimContext),
      messages: modelMessages,
      tools: {
        listClaims: listClaimsTool,
        analyzeClaim: analyzeClaimTool,
        searchSimilarClaims: searchSimilarClaimsTool,
        draftCorrespondence: draftCorrespondenceTool,
        editClaim: editClaimTool,
      },
      stopWhen: stepCountIs(10),
    });

    result.pipeUIMessageStreamToResponse(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Review schema (shared by single + batch endpoints) ────────────────────

const lineItemCorrectionSchema = z.object({
  lineIndex: z.number().int().min(0)
    .describe('Zero-based index into the claim lineItems array'),
  cptCode: z.object({
    current: z.string().describe('Exact current CPT code value from the claim'),
    proposed: z.string().regex(/^\d{4,5}[A-Z0-9]?$/)
      .describe('Corrected CPT/HCPCS code — digits only, e.g. "99213" or "G0438". NO text, NO explanation.'),
  }).optional().describe('Omit if CPT code does not need to change'),
  modifier: z.object({
    current: z.string().nullable().describe('Current modifier, or null if absent'),
    proposed: z.string().regex(/^[A-Z0-9]{2}$/).nullable()
      .describe('Corrected 2-character modifier, e.g. "25", "59", "GT". Null to remove. NO text.'),
  }).optional().describe('Omit if modifier does not need to change'),
  units: z.object({
    current: z.number().int().describe('Current unit count'),
    proposed: z.number().int().min(1).describe('Corrected unit count — positive integer ONLY. No text.'),
  }).optional().describe('Omit if units do not need to change'),
  billedAmount: z.object({
    current: z.number().describe('Current billed amount in dollars'),
    proposed: z.number().positive().describe('Corrected billed amount — numeric dollar value ONLY, e.g. 150.00. No $ symbol, no text.'),
  }).optional().describe('Omit if billed amount does not need to change'),
  rationale: z.string()
    .describe('One sentence: which billing rule or payer policy requires this specific change (keep under 200 chars)'),
  confidence: z.enum(['high', 'medium', 'low']),
});

const claimReviewSchema = z.object({
  claimId: z.string(),
  reasoning: z.string().describe('Root cause analysis: why was this claim denied or underpaid (keep under 400 chars)'),
  recommendedAction: z.string().describe('Brief action label, e.g. "Refile with modifier -25" or "Appeal with medical records" (keep under 100 chars)'),
  confidence: z.enum(['high', 'medium', 'low']),
  shouldFillClaim: z.boolean()
    .describe('Set TRUE only when corrections are unambiguous billing rule violations with no clinical judgment required (e.g. a clearly missing required modifier, an obvious code mismatch per LCD). Set FALSE when the correction requires clinical documentation review or payer-specific knowledge.'),
  lineItemCorrections: z.array(lineItemCorrectionSchema).max(10)
    .describe('Typed corrections per line item. Only include a field if it needs to change. Each value field must contain ONLY the raw value — never include explanatory text inside a value field.'),
});

const REVIEW_SYSTEM = `You are a medical billing expert reviewing claims for a revenue cycle management team.

Your job: identify the root cause and output strictly typed field corrections.

RULES FOR CORRECTIONS:
- cptCode.proposed: raw code only (e.g. "99214"). Never include words or explanation.
- modifier.proposed: exactly 2 alphanumeric characters (e.g. "25") or null to remove. Never include words.
- units.proposed: a positive integer (e.g. 2). Never include words.
- billedAmount.proposed: a positive decimal (e.g. 275.00). Never include $ or words.
- Omit any field from a correction if it does not need to change.
- Only include corrections that are actionable and based on identifiable billing rules or payer policies.
- Do not speculate or invent corrections without clear justification from the denial reason or payer notes.

shouldFillClaim = true: reserved for unambiguous, rule-based fixes only (missing required modifier, obvious code mismatch).
shouldFillClaim = false: use when clinical judgment or documentation is needed.`;

function condenseClaim(claim: (typeof allClaims)[number]) {
  return {
    claimId: claim.claimId,
    payer: claim.payer.name,
    status: claim.status,
    denialCode: claim.denialCode,
    denialReason: claim.denialReason,
    payerNotes: claim.payerNotes,
    lineItems: claim.lineItems,
    totalBilledAmount: claim.totalBilledAmount,
    totalAllowedAmount: claim.totalAllowedAmount,
    totalPaidAmount: claim.totalPaidAmount,
    filingDeadline: claim.filingDeadline,
    priorActions: claim.priorActions,
  };
}

app.post('/api/review', async (req, res) => {
  try {
    const { claimId } = req.body as { claimId: string };
    const claim = allClaims.find((c) => c.claimId === claimId);
    if (!claim) return res.status(404).json({ error: `Claim ${claimId} not found` });

    const key = cacheKey('review', claimId);
    const cached = cacheGet<unknown>(key);
    if (cached) {
      console.log(`[cache hit] review ${claimId}`);
      return res.json(cached);
    }

    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: zodSchema(claimReviewSchema),
      system: REVIEW_SYSTEM,
      prompt: `Review this claim and output strictly typed corrections. Remember: value fields must contain ONLY raw values, never explanatory text.\n\n${JSON.stringify(condenseClaim(claim), null, 2)}`,
    });

    cacheSet(key, object);
    res.json(object);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/batch-review', async (req, res) => {
  try {
    const { claimIds } = req.body as { claimIds: string[] };
    const ids = (Array.isArray(claimIds) ? claimIds : []).slice(0, 10);
    const allRequested = ids.map((id) => allClaims.find((c) => c.claimId === id)).filter(Boolean) as typeof allClaims;
    if (allRequested.length === 0) return res.status(400).json({ error: 'No valid claims' });

    // Split into cached hits and claims that still need AI analysis
    const cachedReviews: unknown[] = [];
    const uncachedClaims: typeof allClaims = [];

    for (const claim of allRequested) {
      const key = cacheKey('review', claim.claimId);
      const hit = cacheGet<unknown>(key);
      if (hit) {
        console.log(`[cache hit] batch-review ${claim.claimId}`);
        cachedReviews.push(hit);
      } else {
        uncachedClaims.push(claim);
      }
    }

    let freshReviews: unknown[] = [];
    if (uncachedClaims.length > 0) {
      const { object } = await generateObject({
        model: anthropic('claude-sonnet-4-6'),
        schema: zodSchema(z.object({ reviews: z.array(claimReviewSchema) })),
        system: REVIEW_SYSTEM,
        prompt: `Review these ${uncachedClaims.length} claims and return one entry per claim. Value fields must contain ONLY raw values, never explanatory text:\n${JSON.stringify(uncachedClaims.map(condenseClaim), null, 2)}`,
      });

      // Cache each result individually
      for (const review of object.reviews) {
        const key = cacheKey('review', (review as { claimId: string }).claimId);
        cacheSet(key, review);
      }
      freshReviews = object.reviews;
    }

    res.json({ reviews: [...cachedReviews, ...freshReviews] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Cluster analysis ───────────────────────────────────────────────────────

interface ClusterSummary {
  clusterKey: string;
  payerFamily: string;
  denialCode: string;
  claimCount: number;
  totalRecoverability: number;
  avgRecoverability: number;
  avgDeadlineDays: number | null;
  claimsOverdue: number;
  claimsUrgent: number;
  topCptCodes: string[];
  submissionDateRange: { earliest: string; latest: string } | null;
  sampleDenialReasons: string[];
}

const clusterAnalysisSchema = z.object({
  rootCause: z.string()
    .describe('Clear explanation of WHY these claims are systematically denied — be specific about the billing workflow or policy issue (keep under 400 chars)'),
  batchAction: z.string()
    .describe('The single highest-leverage action to resolve or recover most claims in this cluster (keep under 250 chars)'),
  confidence: z.enum(['high', 'medium', 'low'])
    .describe('How confident you are in the root cause given the available data'),
  affectsAllClaims: z.boolean()
    .describe('True if the root cause and action apply uniformly to every claim; false if individual review is still needed'),
});

const CLUSTER_SYSTEM = `You are a medical billing expert analyzing a pattern of denied or rejected claims.

You are given a SUMMARY of claims sharing the same payer and denial code — not individual claim details.
Your job:
1. Identify the root cause: WHY are these claims systematically denied? Look for workflow issues, missing documentation patterns, coding errors, or payer-specific policy triggers.
2. Recommend the single best batch action to resolve or recover the most value with the least effort.
3. Assess whether the fix applies uniformly or if individual review is still needed.

Be concrete and specific. Avoid generic advice like "review the claims" — name the exact billing rule, modifier, or workflow change needed.`;

app.post('/api/analyze-cluster', async (req, res) => {
  try {
    const { cluster } = req.body as { cluster: ClusterSummary };
    if (!cluster?.clusterKey) return res.status(400).json({ error: 'Missing cluster summary' });
    if (cluster.claimCount < 2) return res.status(400).json({ error: 'Cluster too small to analyze' });

    const key = cacheKey('cluster', cluster.clusterKey);
    const cached = cacheGet<object>(key);
    if (cached) {
      console.log(`[cache hit] cluster ${cluster.clusterKey}`);
      return res.json({ ...cached, fromCache: true });
    }

    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: zodSchema(clusterAnalysisSchema),
      system: CLUSTER_SYSTEM,
      prompt: `Analyze this claim cluster and identify the root cause and batch action:\n\n${JSON.stringify(cluster, null, 2)}`,
    });

    const result = {
      ...object,
      clusterKey: cluster.clusterKey,
      cachedAt: new Date().toISOString(),
    };
    cacheSet(key, result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV === "development") {
  app.listen(PORT, () => console.log(`Running on ${PORT}`));
}

export default app;
