/**
 * Deterministic teaching-target selection for the class. Pure TypeScript: no
 * Mongoose, auth, AI, environment, randomness, or side effects. The code decides
 * the target and the maximum independence; the planner may only downgrade it.
 */
import { getDomainBucket } from "@/lib/competency/cefr";
import type { CompetencyIndependence } from "@/lib/schemas/competency";

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
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

export type TeachEvidenceIntent =
  | "discover"
  | "positive-evidence"
  | "negative-evidence"
  | "context-diversity"
  | "independent-use"
  | "review";

export type RecommendedMove =
  | "diagnose"
  | "elicit"
  | "clarify"
  | "recast"
  | "explicit-correction"
  | "teach"
  | "guided-practice"
  | "transfer"
  | "review"
  | "encourage";

export interface TeachDefinition {
  code: string;
  domain: string;
  level: string;
  name: string;
  performanceDescriptor: string;
  prerequisites: string[];
  isCritical: boolean;
  evidenceRequired: number;
  contextsRequired: number;
  isActive: boolean;
}

export interface TeachLearnerState {
  competencyCode: string;
  status: "not-demonstrated" | "developing" | "mastered";
  evidenceCount: number;
  distinctContextCount: number;
  negativeEvidenceCount: number;
  weightedAccuracy: number;
  confidence: number;
}

export interface TeachInput {
  sessionLevel: string;
  subject: string;
  sessionTargetedGoals: string[];
  activeDefinitions: TeachDefinition[];
  learnerStates: TeachLearnerState[];
  recentObservations: Array<{ competencyCode: string; result: string; contextKey: string }>;
  recentTurns: Array<{ targetCompetencyCode?: string; contextKey?: string }>;
}

export interface CompetencySnapshot {
  code: string;
  name: string;
  domain: string;
  level: string;
  status: string;
  evidenceCount: number;
  evidenceRequired: number;
  distinctContextCount: number;
  contextsRequired: number;
  weightedAccuracy: number;
  confidence: number;
}

export interface TeachResult {
  targetCompetencyCode: string;
  relatedCompetencyCodes: string[];
  evidenceIntent: TeachEvidenceIntent;
  contextKey: string;
  recommendedMove: RecommendedMove;
  competencySnapshot: CompetencySnapshot;
  maximumIndependence: CompetencyIndependence;
}

function cefrIndex(level: string): number {
  const index = CEFR.indexOf(level as (typeof CEFR)[number]);
  return index < 0 ? 0 : index;
}

export function deriveStudentEvidenceIndependence(input: {
  recommendedMove: RecommendedMove;
  evidenceIntent: TeachEvidenceIntent;
}): CompetencyIndependence {
  if (input.evidenceIntent === "independent-use") return "spontaneous";
  if (input.recommendedMove === "teach") return "imitated";
  if (
    input.recommendedMove === "guided-practice" ||
    input.recommendedMove === "recast" ||
    input.recommendedMove === "explicit-correction"
  ) {
    return "prompted";
  }
  return "spontaneous";
}

function pickContextKey(code: string, recentTurns: TeachInput["recentTurns"], subject: string): string {
  const used = new Set(
    recentTurns
      .filter((turn) => turn.targetCompetencyCode === code)
      .map((turn) => (turn.contextKey ?? "").toLowerCase()),
  );
  const unused = CONTEXT_KEYS.filter((c) => !used.has(c));
  const pool = unused.length ? unused : [...CONTEXT_KEYS];
  const offset = Math.abs(hash(subject)) % pool.length;
  return pool[offset];
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return h;
}

function snapshotOf(definition: TeachDefinition, state: TeachLearnerState | undefined): CompetencySnapshot {
  return {
    code: definition.code,
    name: definition.name,
    domain: definition.domain,
    level: definition.level,
    status: state?.status ?? "not-demonstrated",
    evidenceCount: state?.evidenceCount ?? 0,
    evidenceRequired: definition.evidenceRequired,
    distinctContextCount: state?.distinctContextCount ?? 0,
    contextsRequired: definition.contextsRequired,
    weightedAccuracy: state?.weightedAccuracy ?? 0,
    confidence: state?.confidence ?? 0,
  };
}

function intentFor(state: TeachLearnerState | undefined, definition: TeachDefinition): TeachEvidenceIntent {
  if (!state || state.evidenceCount === 0) return "discover";
  if (state.status === "mastered") return "review";
  if (state.negativeEvidenceCount >= 2) return "negative-evidence";
  if (state.distinctContextCount < definition.contextsRequired) return "context-diversity";
  if (state.weightedAccuracy >= 0.7 && state.distinctContextCount >= 1) return "independent-use";
  return "positive-evidence";
}

function moveFor(intent: TeachEvidenceIntent, state: TeachLearnerState | undefined): RecommendedMove {
  switch (intent) {
    case "discover":
      return "diagnose";
    case "negative-evidence":
      return "explicit-correction";
    case "context-diversity":
      return "transfer";
    case "independent-use":
      return "elicit";
    case "review":
      return "review";
    default:
      return state && state.weightedAccuracy < 0.6 ? "guided-practice" : "elicit";
  }
}

export function selectTeachingCompetency(input: TeachInput): TeachResult | null {
  const studentIndex = cefrIndex(input.sessionLevel);
  const candidates = input.activeDefinitions.filter(
    (d) => d.isActive && getDomainBucket(d.domain) !== "pronunciation" && cefrIndex(d.level) <= studentIndex + 1,
  );
  if (candidates.length === 0) return null;

  const stateByCode = new Map(input.learnerStates.map((s) => [s.competencyCode.toUpperCase(), s]));
  const mastered = new Set(input.learnerStates.filter((s) => s.status === "mastered").map((s) => s.competencyCode.toUpperCase()));
  const goalText = input.sessionTargetedGoals.join(" ").toLowerCase();
  const recentCodes = new Set(input.recentTurns.slice(-2).map((t) => (t.targetCompetencyCode ?? "").toUpperCase()).filter(Boolean));

  const scored = candidates.map((definition) => {
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
    const sessionRelevant = goalText.includes(target.name.toLowerCase()) || goalText.includes(target.domain);

    if (state && state.negativeEvidenceCount >= 2 && state.confidence >= 0.6) score += 40;
    if (state?.status === "developing" && sessionRelevant) score += 35;
    if (state?.status === "developing" && state.distinctContextCount < target.contextsRequired) score += 30;
    if (state && state.status === "developing" && state.weightedAccuracy >= 0.7) score += 25;
    if (mastered.has(target.code.toUpperCase())) score += 10;
    if (!state || state.evidenceCount === 0) score += 20;
    if (target.level === input.sessionLevel) score += 12;

    if (recentCodes.has(target.code.toUpperCase())) score -= 100;

    return { target, score };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      cefrIndex(a.target.level) - cefrIndex(b.target.level) ||
      a.target.domain.localeCompare(b.target.domain) ||
      a.target.code.localeCompare(b.target.code),
  );

  const winner = scored[0].target;
  const state = stateByCode.get(winner.code.toUpperCase());
  const evidenceIntent = intentFor(state, winner);
  const recommendedMove = moveFor(evidenceIntent, state);
  const targetBucket = getDomainBucket(winner.domain);

  return {
    targetCompetencyCode: winner.code,
    relatedCompetencyCodes: candidates
      .filter(
        (d) =>
          d.code !== winner.code &&
          getDomainBucket(d.domain) === targetBucket &&
          Math.abs(cefrIndex(d.level) - cefrIndex(winner.level)) <= 1,
      )
      .sort((a, b) => cefrIndex(a.level) - cefrIndex(b.level) || a.code.localeCompare(b.code))
      .slice(0, 3)
      .map((d) => d.code),
    evidenceIntent,
    contextKey: pickContextKey(winner.code, input.recentTurns, input.subject),
    recommendedMove,
    competencySnapshot: snapshotOf(winner, state),
    maximumIndependence: deriveStudentEvidenceIndependence({ recommendedMove, evidenceIntent }),
  };
}
