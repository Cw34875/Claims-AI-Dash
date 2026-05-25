import type { Claim, EnrichedClaim } from '../types';

const PAYER_FAMILIES: Record<string, string> = {
  'Blue Cross Blue Shield of Illinois': 'BCBS',
  'Blue Cross Blue Shield of Texas': 'BCBS',
  'Blue Cross Blue Shield of Georgia': 'BCBS',
  Aetna: 'Aetna',
  'Aetna HMO': 'Aetna',
  UnitedHealthcare: 'UnitedHealthcare',
  Cigna: 'Cigna',
  'Cigna PPO': 'Cigna',
  'Cigna OAP': 'Cigna',
  'Humana Gold Plus': 'Humana',
  'Humana Choice PPO': 'Humana',
  'Anthem Blue Cross': 'Anthem',
  'Medicare Part B': 'Medicare',
};

export function normalizePayerFamily(payerName: string): string {
  return PAYER_FAMILIES[payerName] ?? payerName;
}

const AI_HINTS: Record<string, string> = {
  'CO-4': 'Fix modifier sequence and resubmit',
  'CO-11': 'Verify network status — may need in-network referral',
  'CO-16': 'Correct missing info (referring NPI, diagnosis) and resubmit',
  'CO-18': 'Add modifier 76/77 to distinguish from duplicate',
  'CO-22': 'Submit primary EOB; update COB records with payer',
  'CO-29': 'Document timely filing exception or write-off',
  'CO-45': 'Verify contracted rate; dispute underpayment if applicable',
  'CO-50': 'Gather clinical documentation for medical necessity appeal',
  'CO-97': 'Review CCI edits; consider unbundling with modifier 59',
  'CO-167': 'Correct diagnosis codes and remove duplicate CPT codes',
  'CO-197': 'Request retroactive auth from UM dept',
};

export function getAiHint(denialCode: string | null): string {
  if (!denialCode) return 'Review claim details for next action';
  return AI_HINTS[denialCode] ?? `Review ${denialCode} denial reason`;
}

export function computeRecoverability(claim: Claim): number {
  if (claim.status === 'underpaid') {
    return (claim.totalAllowedAmount ?? 0) - claim.totalPaidAmount;
  }
  return claim.totalBilledAmount - claim.totalPaidAmount;
}

export function computeDeadlineDays(claim: Claim): number | null {
  if (!claim.filingDeadline) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const deadline = new Date(claim.filingDeadline);
  const diffMs = deadline.getTime() - now.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function computeUrgencyScore(deadlineDays: number | null): number {
  if (deadlineDays === null) return 5;
  if (deadlineDays <= 7) return 100;
  if (deadlineDays <= 14) return 80;
  if (deadlineDays <= 30) return 60;
  return 40;
}

export function computeRecScore(recoverability: number): number {
  return Math.min(100, (Math.log(recoverability + 1) / Math.log(15001)) * 100);
}

export function computePriorityScore(urgencyScore: number, recScore: number): number {
  return urgencyScore * 0.55 + recScore * 0.45;
}

export function computePriorityLevel(score: number): 1 | 2 | 3 {
  if (score >= 75) return 3;
  if (score >= 50) return 2;
  return 1;
}

export function enrichClaim(claim: Claim): EnrichedClaim {
  const recoverability = computeRecoverability(claim);
  const deadlineDays = computeDeadlineDays(claim);
  const urgencyScore = computeUrgencyScore(deadlineDays);
  const recScore = computeRecScore(recoverability);
  const priorityScore = computePriorityScore(urgencyScore, recScore);
  const priorityLevel = computePriorityLevel(priorityScore);
  const payerFamily = normalizePayerFamily(claim.payer.name);
  const aiHint = getAiHint(claim.denialCode);
  return { ...claim, recoverability, deadlineDays, urgencyScore, recScore, priorityScore, priorityLevel, payerFamily, aiHint };
}
