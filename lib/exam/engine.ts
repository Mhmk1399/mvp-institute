/**
 * Deterministic placement-exam engine. Pure TypeScript only: no Mongoose, auth,
 * OpenAI, environment access, randomness, or side effects. The LLM never chooses
 * or updates ability — every ability/target/stop decision lives here.
 */

export const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CEFRCode = (typeof CEFR_ORDER)[number];

export type ExamSkill = "grammar" | "vocabulary" | "function";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Map a 0..5 ability estimate to a CEFR code using fixed bands. */
export function abilityToLevel(ability: number): CEFRCode {
  const a = clamp(ability, 0, 5);
  const index =
    a < 0.5 ? 0 : a < 1.5 ? 1 : a < 2.5 ? 2 : a < 3.5 ? 3 : a < 4.5 ? 4 : 5;
  return CEFR_ORDER[index];
}

export interface AbilityUpdateInput {
  abilityBefore: number;
  score: {
    overallScore: number;
    criteria: {
      accuracy: number;
      grammar: number;
      vocabulary: number;
      taskCompletion: number;
    };
    confidence: number;
  };
}

/** New clamped ability derived solely from the validated AI score + confidence. */
export function calculateAbilityAfter(input: AbilityUpdateInput): number {
  const { overallScore, criteria, confidence } = input.score;
  const effectiveScore =
    overallScore * 0.5 +
    criteria.accuracy * 0.2 +
    criteria.grammar * 0.1 +
    criteria.vocabulary * 0.1 +
    criteria.taskCompletion * 0.1;

  let delta: number;
  if (effectiveScore >= 0.8) delta = 0.5;
  else if (effectiveScore >= 0.65) delta = 0.25;
  else if (effectiveScore > 0.45) delta = 0;
  else if (effectiveScore > 0.3) delta = -0.25;
  else delta = -0.5;

  const modifier = confidence >= 0.8 ? 1 : confidence >= 0.6 ? 0.75 : 0.25;

  return clamp(input.abilityBefore + delta * modifier, 0, 5);
}

export interface EngineLevel {
  code: CEFRCode;
  goals: {
    grammar: string[];
    vocabulary: string[];
    functions: string[];
  };
}

export interface NextTargetInput {
  abilityEstimate: number;
  activeLevels: EngineLevel[];
  coveredGoalKeys: string[];
  turnCount: number;
}

export interface NextTarget {
  targetLevel: CEFRCode;
  targetedSkill: ExamSkill;
  targetedGoal: string;
  goalKey: string;
}

interface FlatGoal {
  skill: ExamSkill;
  goal: string;
  goalKey: string;
}

function normalizeGoal(goal: string): string {
  return goal.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Flatten a level's goals in the fixed order grammar → vocabulary → functions. */
function flattenGoals(level: EngineLevel): FlatGoal[] {
  const groups: Array<{ skill: ExamSkill; items: string[] }> = [
    { skill: "grammar", items: level.goals.grammar },
    { skill: "vocabulary", items: level.goals.vocabulary },
    { skill: "function", items: level.goals.functions },
  ];
  const flat: FlatGoal[] = [];
  for (const { skill, items } of groups) {
    for (const goal of items) {
      flat.push({
        skill,
        goal,
        goalKey: `${level.code}:${skill}:${normalizeGoal(goal)}`,
      });
    }
  }
  return flat;
}

/**
 * Choose the next goal to probe. Projects ability to a CEFR level, then picks the
 * first uncovered goal there; when all are covered it cycles deterministically.
 * Falls back to the nearest active level with goals when the projected code has
 * no usable curriculum.
 */
export function selectNextTarget(input: NextTargetInput): NextTarget {
  const projected = abilityToLevel(input.abilityEstimate);
  const projectedIndex = CEFR_ORDER.indexOf(projected);

  // Candidate levels ordered by distance from the projected index (nearer first,
  // ties resolved toward the lower level) so selection stays deterministic.
  const candidates = [...input.activeLevels].sort((a, b) => {
    const da = Math.abs(CEFR_ORDER.indexOf(a.code) - projectedIndex);
    const db = Math.abs(CEFR_ORDER.indexOf(b.code) - projectedIndex);
    if (da !== db) return da - db;
    return CEFR_ORDER.indexOf(a.code) - CEFR_ORDER.indexOf(b.code);
  });

  const level = candidates.find((candidate) => flattenGoals(candidate).length > 0);
  if (!level) {
    throw new Error("No active level has any goals to target");
  }

  const flat = flattenGoals(level);
  const covered = new Set(input.coveredGoalKeys);
  const chosen =
    flat.find((goal) => !covered.has(goal.goalKey)) ??
    flat[input.turnCount % flat.length];

  return {
    targetLevel: level.code,
    targetedSkill: chosen.skill,
    targetedGoal: chosen.goal,
    goalKey: chosen.goalKey,
  };
}

export interface StopInput {
  turnCount: number;
  recentProjectedLevels: CEFRCode[];
  recentConfidences: number[];
}

/** Stop at 12 turns, or after 8 once the last 3 turns are stable + confident. */
export function shouldFinishExam(input: StopInput): boolean {
  if (input.turnCount >= 12) return true;
  if (input.turnCount < 8) return false;

  const levels = input.recentProjectedLevels.slice(-3);
  const confidences = input.recentConfidences.slice(-3);
  if (levels.length < 3 || confidences.length < 3) return false;

  const stable = levels.every((level) => level === levels[0]);
  const confident = confidences.every((confidence) => confidence >= 0.6);
  return stable && confident;
}

export interface FinalLevelInput {
  abilityEstimate: number;
  recentProjectedLevels: CEFRCode[];
}

/** Median projected level of the last 3 turns, else current ability projection. */
export function calculateFinalLevel(input: FinalLevelInput): CEFRCode {
  const last3 = input.recentProjectedLevels.slice(-3);
  if (last3.length < 3) return abilityToLevel(input.abilityEstimate);

  const indices = last3
    .map((level) => CEFR_ORDER.indexOf(level))
    .sort((a, b) => a - b);
  return CEFR_ORDER[indices[1]];
}
