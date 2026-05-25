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

CRITICAL CONSTRAINT: You are an advisor only. You NEVER take actions directly. Every action requires explicit human approval.`;

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
- Payer notes: ${claim.payerNotes ?? 'none'}`;
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

// ── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, claimContext } = req.body as { messages: unknown[]; claimContext?: string };
    console.log('messages type:', typeof messages, Array.isArray(messages), 'len:', Array.isArray(messages) ? messages.length : 'N/A');

    const modelMessages = await convertToModelMessages(messages as Parameters<typeof convertToModelMessages>[0]);
    console.log('modelMessages type:', typeof modelMessages, Array.isArray(modelMessages));

    const result = streamText({
      model: anthropic('claude-sonnet-4-6'),
      system: buildSystemPrompt(claimContext),
      messages: modelMessages,
      tools: {
        listClaims: listClaimsTool,
        analyzeClaim: analyzeClaimTool,
        searchSimilarClaims: searchSimilarClaimsTool,
        draftCorrespondence: draftCorrespondenceTool,
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
const claimReviewSchema = z.object({
  claimId: z.string(),
  summary: z.string().describe('1-2 sentence root cause summary'),
  recommendedAction: z.string().describe('Primary recommended next step, e.g. "Appeal with medical records"'),
  confidence: z.enum(['high', 'medium', 'low']),
  suggestions: z.array(z.object({
    field: z.string().describe('Technical field identifier, e.g. "lineItems[0].cptCode"'),
    label: z.string().describe('Human-readable name, e.g. "CPT Code (Line 1)"'),
    currentValue: z.string().describe('The current value in the claim, or empty string if absent'),
    suggestedValue: z.string().describe('The recommended corrected value'),
    rationale: z.string().describe('One sentence explaining why this change helps'),
    confidence: z.enum(['high', 'medium', 'low']),
  })).describe('Specific field-level corrections. Only include changes that are actionable and clinically justified.'),
});

const REVIEW_SYSTEM = `You are a medical billing expert reviewing claims for a revenue cycle team.
Analyze each claim and identify the root cause of the issue, then suggest specific, actionable field corrections.
Focus on: incorrect/missing CPT codes, modifiers, ICD-10 codes, billing amounts, place-of-service errors, timely filing workarounds, and documentation gaps.
Only suggest changes that are clinically and financially justified. Do not speculate.`;

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

    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: claimReviewSchema,
      system: REVIEW_SYSTEM,
      prompt: `Review this claim:\n${JSON.stringify(condenseClaim(claim), null, 2)}`,
    });

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
    const claims = ids.map((id) => allClaims.find((c) => c.claimId === id)).filter(Boolean) as typeof allClaims;
    if (claims.length === 0) return res.status(400).json({ error: 'No valid claims' });

    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: z.object({ reviews: z.array(claimReviewSchema) }),
      system: REVIEW_SYSTEM,
      prompt: `Review these ${claims.length} claims and return one entry per claim:\n${JSON.stringify(claims.map(condenseClaim), null, 2)}`,
    });

    res.json(object);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`API server running on :${PORT}`));
