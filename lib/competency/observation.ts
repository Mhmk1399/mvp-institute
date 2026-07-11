/**
 * Deterministic approval of LLM-proposed competency observation candidates.
 * Pure TypeScript: no Mongoose, auth, AI, environment, or side effects. The LLM
 * may propose evidence; this sanitizes and grounds it. Never throws for one bad
 * candidate.
 */
import type {
  CompetencyIndependence,
  CompetencyResult,
} from "@/lib/schemas/competency";

export interface ObservationCandidate {
  competencyCode: string;
  result: CompetencyResult;
  accuracy: number;
  confidence: number;
  independence: CompetencyIndependence;
  evidenceExcerpt: string;
}

export interface ApproveObservationInput {
  candidates: ObservationCandidate[];
  studentMessage: string;
  allowedCompetencyCodes: string[];
  maximumIndependence: CompetencyIndependence;
  pronunciationEligible: boolean;
  listeningEligible: boolean;
  competencyDomainsByCode: Record<string, string>;
}

const INDEPENDENCE_RANK: Record<CompetencyIndependence, number> = {
  imitated: 0,
  prompted: 1,
  spontaneous: 2,
};
const RANK_INDEPENDENCE: CompetencyIndependence[] = ["imitated", "prompted", "spontaneous"];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Unicode + lowercase + punctuation-tolerant + whitespace-normalized form. */
export function normalizeEvidenceText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsGroundedExcerpt(source: string, excerpt: string): boolean {
  const normalizedExcerpt = normalizeEvidenceText(excerpt);
  if (!normalizedExcerpt) return false;
  return normalizeEvidenceText(source).includes(normalizedExcerpt);
}

export function approveObservationCandidates(
  input: ApproveObservationInput,
): ObservationCandidate[] {
  const allowed = new Set(input.allowedCompetencyCodes.map((code) => code.toUpperCase()));
  const maxRank = INDEPENDENCE_RANK[input.maximumIndependence] ?? 2;
  const byCode = new Map<string, ObservationCandidate>();

  for (const raw of input.candidates ?? []) {
    const code = (raw?.competencyCode ?? "").toUpperCase();
    if (!allowed.has(code)) continue;

    const excerpt = (raw.evidenceExcerpt ?? "").trim();
    if (!containsGroundedExcerpt(input.studentMessage, excerpt)) continue;

    const domain = input.competencyDomainsByCode[code];
    if (domain === "pronunciation" && !input.pronunciationEligible) continue;
    if (domain === "listening" && !input.listeningEligible) continue;

    const proposedRank = INDEPENDENCE_RANK[raw.independence] ?? 0;
    const sanitized: ObservationCandidate = {
      competencyCode: code,
      result: raw.result,
      accuracy: clamp01(raw.accuracy),
      confidence: clamp01(raw.confidence),
      independence: RANK_INDEPENDENCE[Math.min(proposedRank, maxRank)],
      evidenceExcerpt: excerpt,
    };

    const existing = byCode.get(code);
    if (!existing || sanitized.confidence > existing.confidence) byCode.set(code, sanitized);
  }

  return [...byCode.values()]
    .sort((a, b) => b.confidence - a.confidence || a.competencyCode.localeCompare(b.competencyCode))
    .slice(0, 4);
}
