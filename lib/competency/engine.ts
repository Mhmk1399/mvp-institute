/**
 * Deterministic competency aggregation. Pure TypeScript: no Mongoose, auth, AI,
 * environment, randomness, or side effects. The LLM never declares mastery; this
 * computes it from multiple immutable observations.
 */
import type {
  CompetencyIndependence,
  CompetencyResult,
  CompetencySourceType,
  CompetencyStatus,
} from "@/lib/schemas/competency";

export interface CompetencyEngineDefinition {
  evidenceRequired: number;
  accuracyThreshold: number;
  contextsRequired: number;
  confidenceThreshold: number;
  isCritical: boolean;
}

export interface CompetencyEngineObservation {
  id: string;
  createdAt: Date | string | number;
  sourceType: CompetencySourceType;
  result: CompetencyResult;
  accuracy: number;
  confidence: number;
  independence: CompetencyIndependence;
  contextKey: string;
}

export interface CompetencyState {
  evidenceCount: number;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
  insufficientEvidenceCount: number;
  distinctContextCount: number;
  weightedAccuracy: number;
  confidence: number;
  criticalContradictionCount: number;
  status: CompetencyStatus;
  lastObservedAt?: Date;
}

export function getIndependenceWeight(independence: CompetencyIndependence): number {
  if (independence === "spontaneous") return 1;
  if (independence === "prompted") return 0.75;
  return 0.3;
}

export function getSourceWeight(sourceType: CompetencySourceType): number {
  return sourceType === "teacher-review" ? 1.2 : 1;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function normalizeContext(contextKey: string): string {
  return contextKey.trim().toLowerCase().replace(/\s+/g, " ");
}

function toTime(value: Date | string | number): number {
  return new Date(value).getTime();
}

export function calculateLearnerCompetency(
  definition: CompetencyEngineDefinition,
  observations: CompetencyEngineObservation[],
): CompetencyState {
  // Deterministic order: createdAt then stable id.
  const ordered = [...observations].sort((a, b) => {
    const delta = toTime(a.createdAt) - toTime(b.createdAt);
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });

  const valid = ordered.filter((o) => o.result === "positive" || o.result === "negative");
  const insufficient = ordered.filter((o) => o.result === "insufficient");

  const lastObserved = ordered[ordered.length - 1];
  const lastObservedAt = lastObserved ? new Date(toTime(lastObserved.createdAt)) : undefined;

  let sumWeight = 0;
  let sumAccuracy = 0;
  let sumConfidence = 0;
  const contexts = new Set<string>();
  for (const observation of valid) {
    const weight = getIndependenceWeight(observation.independence) * getSourceWeight(observation.sourceType);
    sumWeight += weight;
    sumAccuracy += observation.accuracy * weight;
    sumConfidence += observation.confidence * weight;
    const context = normalizeContext(observation.contextKey);
    if (context) contexts.add(context);
  }

  const evidenceCount = valid.length;
  const distinctContextCount = contexts.size;
  const weightedAccuracy = sumWeight > 0 ? clamp01(sumAccuracy / sumWeight) : 0;
  const weightedConfidence = sumWeight > 0 ? clamp01(sumConfidence / sumWeight) : 0;

  const evidenceCoverage = Math.min(1, definition.evidenceRequired > 0 ? evidenceCount / definition.evidenceRequired : 0);
  const contextCoverage = Math.min(1, definition.contextsRequired > 0 ? distinctContextCount / definition.contextsRequired : 0);
  const confidence = clamp01(weightedConfidence * evidenceCoverage * contextCoverage);

  let criticalContradictionCount = 0;
  if (definition.isCritical) {
    const recent = valid.slice(-definition.evidenceRequired);
    criticalContradictionCount = recent.filter(
      (o) => o.result === "negative" && o.confidence >= definition.confidenceThreshold,
    ).length;
  }

  const meetsMastery =
    evidenceCount >= definition.evidenceRequired &&
    distinctContextCount >= definition.contextsRequired &&
    weightedAccuracy >= definition.accuracyThreshold &&
    confidence >= definition.confidenceThreshold &&
    criticalContradictionCount === 0;

  let status: CompetencyStatus;
  if (evidenceCount === 0 && insufficient.length === 0) {
    status = "not-demonstrated";
  } else if (meetsMastery) {
    status = "mastered";
  } else {
    status = "developing";
  }

  return {
    evidenceCount,
    positiveEvidenceCount: valid.filter((o) => o.result === "positive").length,
    negativeEvidenceCount: valid.filter((o) => o.result === "negative").length,
    insufficientEvidenceCount: insufficient.length,
    distinctContextCount,
    weightedAccuracy: round4(weightedAccuracy),
    confidence: round4(confidence),
    criticalContradictionCount,
    status,
    lastObservedAt,
  };
}
