import type { AiProposal, FieldEdit } from '../types';

export interface LineItemCorrection {
  lineIndex: number;
  cptCode?: { current: string; proposed: string };
  modifier?: { current: string | null; proposed: string | null };
  units?: { current: number; proposed: number };
  billedAmount?: { current: number; proposed: number };
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ClaimReview {
  claimId: string;
  reasoning: string;
  recommendedAction: string;
  confidence: 'high' | 'medium' | 'low';
  shouldFillClaim: boolean;
  lineItemCorrections: LineItemCorrection[];
}

export function mapToProposal(review: ClaimReview): AiProposal {
  const defaultStatus = review.shouldFillClaim ? 'accepted' : 'pending';
  const fieldEdits: FieldEdit[] = [];

  for (const c of review.lineItemCorrections) {
    const line = `Line ${c.lineIndex + 1}`;

    if (c.cptCode) {
      fieldEdits.push({
        field: `lineItems[${c.lineIndex}].cptCode`,
        label: `CPT Code (${line})`,
        currentValue: c.cptCode.current,
        proposedValue: c.cptCode.proposed,
        rationale: c.rationale,
        confidence: c.confidence,
        status: defaultStatus,
      });
    }
    if (c.modifier !== undefined) {
      fieldEdits.push({
        field: `lineItems[${c.lineIndex}].modifier`,
        label: `Modifier (${line})`,
        currentValue: c.modifier.current ?? '',
        proposedValue: c.modifier.proposed ?? '',
        rationale: c.rationale,
        confidence: c.confidence,
        status: defaultStatus,
      });
    }
    if (c.units) {
      fieldEdits.push({
        field: `lineItems[${c.lineIndex}].units`,
        label: `Units (${line})`,
        currentValue: String(c.units.current),
        proposedValue: String(c.units.proposed),
        rationale: c.rationale,
        confidence: c.confidence,
        status: defaultStatus,
      });
    }
    if (c.billedAmount) {
      fieldEdits.push({
        field: `lineItems[${c.lineIndex}].billedAmount`,
        label: `Billed Amount (${line})`,
        currentValue: c.billedAmount.current.toFixed(2),
        proposedValue: c.billedAmount.proposed.toFixed(2),
        rationale: c.rationale,
        confidence: c.confidence,
        status: defaultStatus,
      });
    }
  }

  return {
    claimId: review.claimId,
    recommendedAction: review.recommendedAction,
    confidence: review.confidence,
    reasoning: review.reasoning,
    fieldEdits,
    draftText: '',
  };
}
