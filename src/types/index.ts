export interface LineItem {
  cptCode: string;
  description: string;
  modifier?: string;
  units: number;
  billedAmount: number;
  allowedAmount: number | null;
  paidAmount: number;
}

export interface PriorAction {
  date: string;
  type: string;
  description: string;
  outcome: string;
}

export interface Claim {
  claimId: string;
  patient: { name: string; dateOfBirth: string; memberId: string };
  provider: { name: string; npi: string; specialty: string; facility: string };
  payer: { name: string; payerId: string };
  dateOfService: string;
  dateSubmitted: string;
  lineItems: LineItem[];
  totalBilledAmount: number;
  totalAllowedAmount: number | null;
  totalPaidAmount: number;
  status: 'denied' | 'rejected' | 'underpaid' | 'pending';
  denialReason: string | null;
  denialCode: string | null;
  payerNotes: string | null;
  priorActions: PriorAction[];
  filingDeadline: string | null;
}

export interface EnrichedClaim extends Claim {
  recoverability: number;
  deadlineDays: number | null;
  urgencyScore: number;
  recScore: number;
  priorityScore: number;
  priorityLevel: 1 | 2 | 3;
  payerFamily: string;
  aiHint: string;
}

export type ViewMode = 'sweep' | 'cluster';

export interface Cluster {
  key: string;
  payerFamily: string;
  denialCode: string;
  claims: EnrichedClaim[];
  totalRecoverability: number;
  // computed stats used for cluster-level AI analysis
  avgRecoverability: number;
  avgDeadlineDays: number | null;
  claimsOverdue: number;
  claimsUrgent: number;
  topCptCodes: string[];
  submissionDateRange: { earliest: string; latest: string } | null;
  sampleDenialReasons: string[];
}

export interface ClusterAnalysis {
  clusterKey: string;
  rootCause: string;
  batchAction: string;
  confidence: 'high' | 'medium' | 'low';
  affectsAllClaims: boolean;
  cachedAt: string;
  fromCache?: boolean;
}

export interface Filters {
  payerFamilies: string[];
  denialCodes: string[];
  statuses: string[];
  minAmount: number | null;
  maxAmount: number | null;
  deadlineWithin: number | null;
  overdueOnly: boolean;
}

export type ClaimAction = 'skipped' | 'draft_saved' | 'submitted';

export interface FieldEdit {
  field: string;
  label: string;
  currentValue: string;
  proposedValue: string;
  rationale?: string;
  confidence?: 'high' | 'medium' | 'low';
  status: 'pending' | 'accepted' | 'rejected' | 'edited';
  editedValue?: string;
}

export interface AiProposal {
  claimId: string;
  recommendedAction: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  fieldEdits: FieldEdit[];
  draftText: string;
  isWriteOff?: boolean;
}

export interface ClaimSessionState {
  claimId: string;
  action?: ClaimAction;
  draftText?: string;
  editedFields?: Record<string, string>;
  aiProposal?: AiProposal;
  feedback?: 'helpful' | 'not_helpful';
  outcomeResult?: 'approved' | 'denied_again' | 'partial' | 'escalated';
}
