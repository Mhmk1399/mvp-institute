/**
 * Deterministic CEFR projection from competency evidence. Pure TypeScript: no
 * Mongoose, auth, AI, environment, randomness, or side effects. No prompt ever
 * decides CEFR; this does, from aggregated evidence.
 */
import { abilityToLevel } from "@/lib/exam/engine";
import type { CompetencyIndependence, CompetencyResult } from "@/lib/schemas/competency";

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
type Cefr = (typeof CEFR_ORDER)[number];

export const DOMAIN_BUCKETS = {
  grammar: "grammar",
  vocabulary: "vocabulary",
  function: "communication",
  communication: "communication",
  speaking: "speaking",
  listening: "listening",
  pronunciation: "pronunciation",
  reading: "reading",
  writing: "writing",
} as const;

export type DomainBucket =
  | "grammar"
  | "vocabulary"
  | "communication"
  | "speaking"
  | "listening"
  | "pronunciation"
  | "reading"
  | "writing";

export function getDomainBucket(domain: string): DomainBucket {
  return (DOMAIN_BUCKETS as Record<string, DomainBucket>)[domain] ?? "grammar";
}

export type ConfidenceBand = "low" | "medium" | "high";

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.55) return "medium";
  return "low";
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function cefrIndex(level: string): number {
  return CEFR_ORDER.indexOf(level as Cefr);
}

function independenceWeight(independence: CompetencyIndependence): number {
  if (independence === "spontaneous") return 1;
  if (independence === "prompted") return 0.75;
  return 0.3;
}

export interface StrictAchievementInput {
  definitions: Array<{ code: string; domain: string; level: string; isCritical: boolean; isActive: boolean }>;
  learnerStates: Array<{ competencyCode: string; status: string }>;
  levels: Array<{ code: string; passThreshold: number }>;
}

export interface StrictAchievementResult {
  achievedLevel?: Cefr;
  domainRatios: Array<{ level: string; bucket: string; mastered: number; active: number; ratio: number }>;
  missingCriticalCodes: string[];
}

export function deriveStrictAchievement(input: StrictAchievementInput): StrictAchievementResult {
  const mastered = new Set(
    input.learnerStates.filter((s) => s.status === "mastered").map((s) => s.competencyCode.toUpperCase()),
  );
  const passByLevel = new Map(input.levels.map((l) => [l.code, l.passThreshold]));

  let achievedLevel: Cefr | undefined;
  const domainRatios: StrictAchievementResult["domainRatios"] = [];
  const missingCritical = new Set<string>();

  for (const level of CEFR_ORDER) {
    const active = input.definitions.filter((d) => d.isActive && d.level === level);
    if (active.length === 0) {
      achievedLevel = level;
      continue;
    }
    const passThreshold = passByLevel.get(level) ?? 0.8;
    const missing = active.filter((d) => d.isCritical && !mastered.has(d.code.toUpperCase()));

    const buckets = new Map<string, { mastered: number; active: number }>();
    for (const definition of active) {
      const bucket = getDomainBucket(definition.domain);
      const entry = buckets.get(bucket) ?? { mastered: 0, active: 0 };
      entry.active += 1;
      if (mastered.has(definition.code.toUpperCase())) entry.mastered += 1;
      buckets.set(bucket, entry);
    }

    let levelOk = missing.length === 0;
    for (const [bucket, counts] of buckets) {
      const ratio = counts.active > 0 ? counts.mastered / counts.active : 1;
      domainRatios.push({ level, bucket, mastered: counts.mastered, active: counts.active, ratio: round4(ratio) });
      if (ratio < passThreshold) levelOk = false;
    }

    if (!levelOk) {
      for (const definition of missing) missingCritical.add(definition.code);
      break;
    }
    achievedLevel = level;
  }

  return { achievedLevel, domainRatios, missingCriticalCodes: [...missingCritical] };
}

export interface ExamProjectionInput {
  definitions: Array<{ code: string; domain: string; level: string }>;
  observations: Array<{
    competencyCode: string;
    result: CompetencyResult;
    accuracy: number;
    confidence: number;
    independence: CompetencyIndependence;
  }>;
  legacyAbilityEstimate: number;
  strictAchievedLevel?: string;
}

export interface ExamProjectionResult {
  estimatedLevel: Cefr;
  strictAchievedLevel?: Cefr;
  confidence: number;
  confidenceBand: ConfidenceBand;
  usedLegacyFallback: boolean;
  validObservationCount: number;
  distinctDomainCount: number;
  directlySupportedLevels: Cefr[];
  domainScores: Array<{
    domain: string;
    positiveWeight: number;
    negativeWeight: number;
    support: number;
    observationCount: number;
  }>;
}

export function deriveExamProjection(input: ExamProjectionInput): ExamProjectionResult {
  const defByCode = new Map(input.definitions.map((d) => [d.code.toUpperCase(), d]));
  const valid = input.observations.filter((o) => o.result === "positive" || o.result === "negative");

  interface LevelAgg { obsCount: number; buckets: Set<string>; positive: number; total: number }
  interface DomainAgg { positive: number; negative: number; count: number }
  const levelAgg = new Map<string, LevelAgg>();
  const domainAgg = new Map<string, DomainAgg>();
  const domainsSeen = new Set<string>();
  let validCount = 0;
  let sumConfWeighted = 0;
  let sumWeight = 0;

  for (const observation of valid) {
    const definition = defByCode.get(observation.competencyCode.toUpperCase());
    if (!definition) continue;
    validCount += 1;
    const bucket = getDomainBucket(definition.domain);
    const weight = independenceWeight(observation.independence);
    const positiveWeight = observation.accuracy * observation.confidence * weight;
    const negativeWeight = (1 - observation.accuracy) * observation.confidence * weight;
    const isPositive = observation.result === "positive";

    const level = levelAgg.get(definition.level) ?? { obsCount: 0, buckets: new Set(), positive: 0, total: 0 };
    level.obsCount += 1;
    level.buckets.add(bucket);
    level.positive += isPositive ? positiveWeight : 0;
    level.total += isPositive ? positiveWeight : negativeWeight;
    levelAgg.set(definition.level, level);

    const domain = domainAgg.get(bucket) ?? { positive: 0, negative: 0, count: 0 };
    domain.count += 1;
    if (isPositive) domain.positive += positiveWeight;
    else domain.negative += negativeWeight;
    domainAgg.set(bucket, domain);

    domainsSeen.add(bucket);
    sumConfWeighted += observation.confidence * weight;
    sumWeight += weight;
  }

  const directlySupportedLevels = [...levelAgg.entries()]
    .filter(([, agg]) => {
      const support = agg.total > 0 ? agg.positive / agg.total : 0;
      return agg.obsCount >= 2 && agg.buckets.size >= 2 && support >= 0.6;
    })
    .map(([level]) => level as Cefr)
    .sort((a, b) => cefrIndex(a) - cefrIndex(b));

  const probedLevels = [...levelAgg.keys()].sort((a, b) => cefrIndex(a) - cefrIndex(b));
  const highestProbed = probedLevels[probedLevels.length - 1];

  let usedLegacyFallback = false;
  let estimatedIndex: number;
  if (directlySupportedLevels.length > 0) {
    estimatedIndex = cefrIndex(directlySupportedLevels[directlySupportedLevels.length - 1]);
  } else {
    usedLegacyFallback = true;
    estimatedIndex = cefrIndex(abilityToLevel(input.legacyAbilityEstimate));
    if (highestProbed) estimatedIndex = Math.min(estimatedIndex, cefrIndex(highestProbed));
  }
  if (input.strictAchievedLevel) {
    estimatedIndex = Math.max(estimatedIndex, cefrIndex(input.strictAchievedLevel));
  }
  if (highestProbed) estimatedIndex = Math.min(estimatedIndex, cefrIndex(highestProbed));
  estimatedIndex = Math.min(CEFR_ORDER.length - 1, Math.max(0, estimatedIndex));

  const weightedMeanConfidence = sumWeight > 0 ? sumConfWeighted / sumWeight : 0;
  const confidence = round4(
    clamp01(weightedMeanConfidence * Math.min(1, validCount / 6) * Math.min(1, domainsSeen.size / 3)),
  );

  return {
    estimatedLevel: CEFR_ORDER[estimatedIndex],
    strictAchievedLevel: input.strictAchievedLevel as Cefr | undefined,
    confidence,
    confidenceBand: confidenceBand(confidence),
    usedLegacyFallback,
    validObservationCount: validCount,
    distinctDomainCount: domainsSeen.size,
    directlySupportedLevels,
    domainScores: [...domainAgg.entries()].map(([domain, agg]) => ({
      domain,
      positiveWeight: round4(agg.positive),
      negativeWeight: round4(agg.negative),
      support: round4(agg.positive + agg.negative > 0 ? agg.positive / (agg.positive + agg.negative) : 0),
      observationCount: agg.count,
    })),
  };
}
