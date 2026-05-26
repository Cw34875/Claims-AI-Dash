import { tool, zodSchema } from 'ai';
import { z } from 'zod';

// esbuild (used by tsx and Vercel's bundler) inlines JSON imports at build time —
// no runtime file I/O, works in both Node.js and Edge runtimes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import rawClaimsJson from '../../claims.json';

type RawClaim = {
  claimId: string;
  patient: { name: string; dateOfBirth: string; memberId: string };
  provider: { name: string; npi: string; specialty: string; facility: string };
  payer: { name: string; payerId: string };
  dateOfService: string;
  lineItems: Array<{
    cptCode: string;
    description: string;
    modifier?: string;
    units: number;
    billedAmount: number;
    allowedAmount: number | null;
    paidAmount: number;
  }>;
  totalBilledAmount: number;
  totalAllowedAmount: number | null;
  totalPaidAmount: number;
  status: 'denied' | 'rejected' | 'underpaid' | 'pending';
  denialReason: string | null;
  denialCode: string | null;
  payerNotes: string | null;
  priorActions: Array<{ date: string; type: string; description: string; outcome: string }>;
  filingDeadline: string | null;
};

export type EnrichedClaim = RawClaim & {
  recoverability: number;
  deadlineDays: number | null;
  priorityScore: number;
  payerFamily: string;
};

// ── Priority helpers ───────────────────────────────────────────────────────

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

export function normalizePayerFamily(name: string): string {
  return PAYER_FAMILIES[name] ?? name;
}

function computeRecoverability(c: RawClaim): number {
  if (c.status === 'underpaid') return (c.totalAllowedAmount ?? 0) - c.totalPaidAmount;
  return c.totalBilledAmount - c.totalPaidAmount;
}

function computeDeadlineDays(c: RawClaim): number | null {
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

export const allClaims: EnrichedClaim[] = (rawClaimsJson as RawClaim[]).map((c) => {
  const rec = computeRecoverability(c);
  const days = computeDeadlineDays(c);
  const us = urgencyScore(days);
  const rs = recScore(rec);
  const ps = us * 0.55 + rs * 0.45;
  return { ...c, recoverability: rec, deadlineDays: days, priorityScore: ps, payerFamily: normalizePayerFamily(c.payer.name) };
});

function fmt$(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

// ── System prompt ──────────────────────────────────────────────────────────

export function buildSystemPrompt(selectedClaimId?: string): string {
  const byStatus = { denied: 0, rejected: 0, underpaid: 0, pending: 0 };
  let totalAtRisk = 0;
  let urgentCount = 0;
  for (const c of allClaims) {
    byStatus[c.status as keyof typeof byStatus]++;
    totalAtRisk += c.recoverability;
    if (c.deadlineDays !== null && c.deadlineDays <= 7) urgentCount++;
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
      base += `

CURRENTLY FOCUSED CLAIM: ${claim.claimId}
- Patient: ${claim.patient.name} | Payer: ${claim.payer.name}
- Status: ${claim.status.toUpperCase()} | Denial: ${claim.denialCode ?? 'N/A'} — ${claim.denialReason ?? 'N/A'}
- Billed: ${fmt$(claim.totalBilledAmount)} | At risk: ${fmt$(claim.recoverability)}
- Deadline: ${claim.deadlineDays !== null ? `${claim.deadlineDays} days` : 'none'}
- Payer notes: ${claim.payerNotes ?? 'none'}
- Service lines (use zero-based lineIndex when calling editClaim):
${claim.lineItems.map((li, i) => `  [${i}] CPT ${li.cptCode}${li.modifier ? ` mod ${li.modifier}` : ''} × ${li.units} — $${li.billedAmount}`).join('\n')}`;
    }
  }

  return base;
}

// ── Tools ──────────────────────────────────────────────────────────────────

export const listClaimsTool = tool({
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
    if (!includeExpired) claims = claims.filter((c) => c.deadlineDays === null || c.deadlineDays >= 0);
    if (denialCode) claims = claims.filter((c) => c.denialCode === denialCode);
    if (providerName) {
      const q = providerName.toLowerCase();
      claims = claims.filter((c) => c.provider.name.toLowerCase().includes(q));
    }
    if (cptCode) claims = claims.filter((c) => c.lineItems.some((li) => li.cptCode === cptCode));
    if (payerName) {
      const q = payerName.toLowerCase();
      const fam = normalizePayerFamily(payerName);
      claims = claims.filter((c) => c.payer.name.toLowerCase().includes(q) || c.payerFamily === fam);
    }

    claims.sort((a, b) => {
      if (a.deadlineDays === null && b.deadlineDays === null) return b.recoverability - a.recoverability;
      if (a.deadlineDays === null) return 1;
      if (b.deadlineDays === null) return -1;
      if (a.deadlineDays !== b.deadlineDays) return a.deadlineDays - b.deadlineDays;
      return b.recoverability - a.recoverability;
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
        deadlineDays: c.deadlineDays,
        recoverability: c.recoverability,
        totalBilledAmount: c.totalBilledAmount,
        totalAllowedAmount: c.totalAllowedAmount ?? null,
        totalPaidAmount: c.totalPaidAmount,
      })),
    };
  },
});

export const analyzeClaimTool = tool({
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
        recoverability: claim.recoverability,
        deadlineDays: claim.deadlineDays,
        priorActions: claim.priorActions,
        filingDeadline: claim.filingDeadline,
      },
    };
  },
});

export const searchSimilarClaimsTool = tool({
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
      matches = matches.filter((c) => c.payerFamily === fam || c.payer.name.toLowerCase().includes(payerName.toLowerCase()));
    }
    if (cptCode) matches = matches.filter((c) => c.lineItems.some((li) => li.cptCode === cptCode));
    const totalRecoverability = matches.reduce((s, c) => s + c.recoverability, 0);
    return {
      count: matches.length,
      totalRecoverability,
      claims: matches.slice(0, 8).map((c) => ({
        claimId: c.claimId,
        patient: c.patient.name,
        payer: c.payer.name,
        status: c.status,
        denialCode: c.denialCode,
        recoverability: c.recoverability,
        deadlineDays: c.deadlineDays,
      })),
    };
  },
});

export const draftCorrespondenceTool = tool({
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

export const editClaimTool = tool({
  description:
    "Propose pending edits to a claim's service lines (modifier, CPT code, units, billed amount). Edits appear as suggestions in the UI — the user reviews and accepts or rejects each before saving. Use this when the user explicitly asks you to change or add something to the current claim.",
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

// ── Review schemas (used by /api/review and /api/batch-review) ─────────────

export const lineItemCorrectionSchema = z.object({
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

export const claimReviewSchema = z.object({
  claimId: z.string(),
  reasoning: z.string().describe('Root cause analysis: why was this claim denied or underpaid (keep under 400 chars)'),
  recommendedAction: z.string().describe('Brief action label, e.g. "Refile with modifier -25" or "Appeal with medical records" (keep under 100 chars)'),
  confidence: z.enum(['high', 'medium', 'low']),
  shouldFillClaim: z.boolean()
    .describe('Set TRUE only when corrections are unambiguous billing rule violations with no clinical judgment required. Set FALSE when the correction requires clinical documentation review or payer-specific knowledge.'),
  lineItemCorrections: z.array(lineItemCorrectionSchema).max(10)
    .describe('Typed corrections per line item. Only include a field if it needs to change. Each value field must contain ONLY the raw value — never include explanatory text inside a value field.'),
});

export const REVIEW_SYSTEM = `You are a medical billing expert reviewing claims for a revenue cycle management team.

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

export function condenseClaim(claim: EnrichedClaim) {
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

// ── Cluster analysis schema (used by /api/analyze-cluster) ─────────────────

export const clusterAnalysisSchema = z.object({
  rootCause: z.string()
    .describe('Clear explanation of WHY these claims are systematically denied — be specific about the billing workflow or policy issue (keep under 400 chars)'),
  batchAction: z.string()
    .describe('The single highest-leverage action to resolve or recover most claims in this cluster (keep under 250 chars)'),
  confidence: z.enum(['high', 'medium', 'low'])
    .describe('How confident you are in the root cause given the available data'),
  affectsAllClaims: z.boolean()
    .describe('True if the root cause and action apply uniformly to every claim; false if individual review is still needed'),
});

export const CLUSTER_SYSTEM = `You are a medical billing expert analyzing a pattern of denied or rejected claims.

You are given a SUMMARY of claims sharing the same payer and denial code — not individual claim details.
Your job:
1. Identify the root cause: WHY are these claims systematically denied? Look for workflow issues, missing documentation patterns, coding errors, or payer-specific policy triggers.
2. Recommend the single best batch action to resolve or recover the most value with the least effort.
3. Assess whether the fix applies uniformly or if individual review is still needed.

Be concrete and specific. Avoid generic advice like "review the claims" — name the exact billing rule, modifier, or workflow change needed.`;
