/**
 * Deterministic competency-aware placement probing. Pure TypeScript: no
 * Mongoose, auth, AI, environment, randomness, or side effects. The application
 * chooses targets; the LLM only writes questions and proposes evidence.
 */
import { abilityToLevel } from "@/lib/exam/engine";
import { getDomainBucket } from "@/lib/competency/cefr";
import type { CompetencyIndependence } from "@/lib/schemas/competency";

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
type Cefr = (typeof CEFR)[number];

const CONTEXT_KEYS = [
  "personal-experience",
  "future-plan",
  "problem-solving",
  "opinion",
  "roleplay",
  "comparison",
  "formal-register",
  "informal-register",
] as const;

const DOMAIN_ORDER = [
  "grammar",
  "vocabulary",
  "function",
  "communication",
  "speaking",
  "listening",
  "pronunciation",
  "reading",
  "writing",
];

export type EvidenceIntent =
  | "discover"
  | "positive-evidence"
  | "negative-evidence"
  | "context-diversity"
  | "independent-use"
  | "boundary-probe";

export type TaskType =
  | "open-response"
  | "roleplay"
  | "reformulation"
  | "explanation"
  | "audio-comprehension"
  | "register-shift";

export interface ProbeDefinition {
  code: string;
  domain: string;
  level: string;
  name: string;
  performanceDescriptor: string;
  prerequisites: string[];
  isCritical: boolean;
  evidenceRequired: number;
  contextsRequired: number;
}

export interface ProbeLearnerState {
  competencyCode: string;
  status: "not-demonstrated" | "developing" | "mastered";
  evidenceCount: number;
  distinctContextCount: number;
  negativeEvidenceCount: number;
  weightedAccuracy: number;
  confidence: number;
}

export interface ProbeInput {
  abilityEstimate: number;
  turnCount: number;
  activeDefinitions: ProbeDefinition[];
  learnerStates: ProbeLearnerState[];
  recentTurns: Array<{ targetCompetencyCode?: string; domain?: string }>;
  previousContextKeys: Record<string, string[]>;
}

export interface ProbeResult {
  targetCompetencyCode: string;
  relatedCompetencyCodes: string[];
  targetLevel: Cefr;
  domain: string;
  performanceDescriptor: string;
  evidenceIntent: EvidenceIntent;
  contextKey: string;
  taskType: TaskType;
  pronunciationEligible: boolean;
  listeningEligible: boolean;
  maximumIndependence: CompetencyIndependence;
}

function cefrIndex(level: string): number {
  const index = CEFR.indexOf(level as Cefr);
  return index < 0 ? 0 : index;
}

function candidateLevels(abilityEstimate: number): { candidate: Cefr; levels: Cefr[] } {
  const candidateIndex = cefrIndex(abilityToLevel(abilityEstimate));
  const from = Math.max(0, candidateIndex - 1);
  const to = Math.min(CEFR.length - 1, candidateIndex + 1);
  const levels: Cefr[] = [];
  for (let i = from; i <= to; i += 1) levels.push(CEFR[i]);
  return { candidate: CEFR[candidateIndex], levels };
}

function pickContextKey(code: string, previous: Record<string, string[]>, turnCount: number): string {
  const used = new Set((previous[code] ?? []).map((c) => c.toLowerCase()));
  const unused = CONTEXT_KEYS.filter((c) => !used.has(c));
  const pool = unused.length ? unused : [...CONTEXT_KEYS];
  return pool[turnCount % pool.length];
}

function pickTaskType(level: string, domain: string, contextKey: string): TaskType {
  if (contextKey === "roleplay") return "roleplay";
  if (level === "C1" || level === "C2") {
    if (getDomainBucket(domain) === "communication") return "register-shift";
    if (domain === "grammar") return "reformulation";
    return "explanation";
  }
  return "open-response";
}

function relatedFor(
  target: ProbeDefinition,
  definitions: ProbeDefinition[],
): string[] {
  const targetIndex = cefrIndex(target.level);
  const targetBucket = getDomainBucket(target.domain);
  return definitions
    .filter(
      (d) =>
        d.code !== target.code &&
        getDomainBucket(d.domain) === targetBucket &&
        Math.abs(cefrIndex(d.level) - targetIndex) <= 1,
    )
    .sort((a, b) => cefrIndex(a.level) - cefrIndex(b.level) || a.code.localeCompare(b.code))
    .slice(0, 3)
    .map((d) => d.code);
}

function evidenceIntentFor(state: ProbeLearnerState | undefined, target: ProbeDefinition): EvidenceIntent {
  if (!state || state.evidenceCount === 0) return "discover";
  if (state.distinctContextCount < target.contextsRequired) return "context-diversity";
  if (state.negativeEvidenceCount >= 2) return "negative-evidence";
  if (state.status === "developing") return "positive-evidence";
  return "boundary-probe";
}

function buildResult(
  target: ProbeDefinition,
  definitions: ProbeDefinition[],
  state: ProbeLearnerState | undefined,
  previousContextKeys: Record<string, string[]>,
  turnCount: number,
  intent: EvidenceIntent,
): ProbeResult {
  const contextKey = pickContextKey(target.code, previousContextKeys, turnCount);
  return {
    targetCompetencyCode: target.code,
    relatedCompetencyCodes: relatedFor(target, definitions),
    targetLevel: target.level as Cefr,
    domain: target.domain,
    performanceDescriptor: target.performanceDescriptor,
    evidenceIntent: intent,
    contextKey,
    taskType: pickTaskType(target.level, target.domain, contextKey),
    // No audio-analysis and questions are visible text: never eligible.
    pronunciationEligible: false,
    listeningEligible: false,
    maximumIndependence: "spontaneous",
  };
}

export function selectNextCompetencyProbe(input: ProbeInput): ProbeResult | null {
  const { candidate, levels } = candidateLevels(input.abilityEstimate);
  const levelSet = new Set(levels);
  const inScope = input.activeDefinitions.filter((d) => levelSet.has(d.level as Cefr));
  if (inScope.length === 0) return null;

  const stateByCode = new Map(input.learnerStates.map((s) => [s.competencyCode.toUpperCase(), s]));
  const mastered = new Set(
    input.learnerStates.filter((s) => s.status === "mastered").map((s) => s.competencyCode.toUpperCase()),
  );

  // Discovery turns.
  if (input.turnCount <= 1) {
    const preference =
      input.turnCount === 0
        ? ["communication", "vocabulary", "grammar"]
        : ["vocabulary", "grammar", "communication"];
    for (const domain of preference) {
      const pool = inScope
        .filter((d) => getDomainBucket(d.domain) === (domain === "communication" ? "communication" : domain))
        .sort(
          (a, b) =>
            cefrIndex(a.level) - cefrIndex(b.level) ||
            Number(Boolean(stateByCode.get(a.code.toUpperCase())?.evidenceCount)) -
              Number(Boolean(stateByCode.get(b.code.toUpperCase())?.evidenceCount)) ||
            a.code.localeCompare(b.code),
        );
      if (pool.length) {
        return buildResult(pool[0], input.activeDefinitions, stateByCode.get(pool[0].code.toUpperCase()), input.previousContextKeys, input.turnCount, "discover");
      }
    }
  }

  const recentCodes = new Set(
    input.recentTurns.slice(-2).map((t) => (t.targetCompetencyCode ?? "").toUpperCase()).filter(Boolean),
  );
  const previousDomain = input.recentTurns[input.recentTurns.length - 1]?.domain;

  // Score each in-scope definition; retarget to an unmet active prerequisite.
  const scored = inScope.map((definition) => {
    let target = definition;
    let score = 0;

    const unmetPrereq = definition.prerequisites
      .map((code) => input.activeDefinitions.find((d) => d.code.toUpperCase() === code.toUpperCase()))
      .find((d) => d && !mastered.has(d.code.toUpperCase()));
    if (unmetPrereq) {
      target = unmetPrereq;
      score += 100;
    }

    const state = stateByCode.get(target.code.toUpperCase());
    if (target.isCritical && (!state || state.evidenceCount < target.evidenceRequired)) score += 40;
    if (state && state.negativeEvidenceCount >= 2 && state.confidence >= 0.6) score += 35;
    if (state?.status === "developing") score += 30;
    if (!state || state.evidenceCount === 0) score += 25;

    const evidenceGap = 1 - Math.min(1, (state?.evidenceCount ?? 0) / Math.max(1, target.evidenceRequired));
    score += evidenceGap * 20;
    const contextGap = 1 - Math.min(1, (state?.distinctContextCount ?? 0) / Math.max(1, target.contextsRequired));
    score += contextGap * 15;

    if (target.level === candidate) score += 12;
    else if (Math.abs(cefrIndex(target.level) - cefrIndex(candidate)) === 1) score += 8;

    if (recentCodes.has(target.code.toUpperCase())) score -= 100;
    if (previousDomain && previousDomain === target.domain) score -= 10;

    return { target, score };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      cefrIndex(a.target.level) - cefrIndex(b.target.level) ||
      DOMAIN_ORDER.indexOf(a.target.domain) - DOMAIN_ORDER.indexOf(b.target.domain) ||
      a.target.code.localeCompare(b.target.code),
  );

  const winner = scored[0].target;
  const state = stateByCode.get(winner.code.toUpperCase());
  return buildResult(
    winner,
    input.activeDefinitions,
    state,
    input.previousContextKeys,
    input.turnCount,
    evidenceIntentFor(state, winner),
  );
}

export interface FinishInput {
  turnCount: number;
  recentProjectionLevels: string[];
  recentProjectionConfidences: number[];
  validObservationCount: number;
  distinctDomainCount: number;
  candidateProbed: boolean;
  adjacentBoundaryProbed: boolean;
  recentSyncStatuses: string[];
}

export function shouldFinishCompetencyExam(
  input: FinishInput,
): { finished: boolean; reason?: "converged" | "hard-stop" } {
  if (input.turnCount >= 12) return { finished: true, reason: "hard-stop" };
  if (input.turnCount < 8) return { finished: false };

  const levels = input.recentProjectionLevels.slice(-3);
  const confidences = input.recentProjectionConfidences.slice(-3);
  const syncs = input.recentSyncStatuses.slice(-3);
  const stable = levels.length === 3 && levels.every((l) => l === levels[0]);
  const confident = confidences.length === 3 && confidences.every((c) => c >= 0.65);
  const enoughEvidence = input.validObservationCount >= 6;
  const enoughDomains = input.distinctDomainCount >= 3;
  const noRecentFailure = !syncs.includes("failed");

  if (
    stable &&
    confident &&
    enoughEvidence &&
    enoughDomains &&
    input.candidateProbed &&
    input.adjacentBoundaryProbed &&
    noRecentFailure
  ) {
    return { finished: true, reason: "converged" };
  }
  return { finished: false };
}

export interface FinalInput {
  estimatedLevel: string;
  confidenceBand: "low" | "medium" | "high";
  usedLegacyFallback: boolean;
  distinctDomainCount: number;
  reason: "converged" | "hard-stop";
}

export function calculateCompetencyExamFinal(input: FinalInput): {
  finalLevel: string;
  completionReason: "converged" | "hard-stop" | "legacy-fallback";
  profileNeedsTeacherReview: boolean;
} {
  const completionReason = input.usedLegacyFallback ? "legacy-fallback" : input.reason;
  const profileNeedsTeacherReview =
    input.reason === "hard-stop" &&
    (input.confidenceBand === "low" || input.usedLegacyFallback || input.distinctDomainCount < 3);
  return { finalLevel: input.estimatedLevel, completionReason, profileNeedsTeacherReview };
}
