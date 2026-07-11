import "server-only";

import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/db/mongoose";
import {
  CompetencyDefinition,
  type CompetencyDefinitionDoc,
} from "@/lib/models/competency-definition";
import {
  CompetencyObservation,
  type CompetencyObservationDoc,
} from "@/lib/models/competency-observation";
import {
  LearnerCompetency,
  type LearnerCompetencyDoc,
} from "@/lib/models/learner-competency";
import {
  createCompetencyDefinitionSchema,
  updateCompetencyDefinitionSchema,
  createCompetencyObservationSchema,
  type CompetencyDomain,
  type CompetencyIndependence,
  type CompetencyResult,
  type CompetencySourceType,
  type CompetencyStatus,
} from "@/lib/schemas/competency";
import { calculateLearnerCompetency } from "@/lib/competency/engine";

type CefrCode = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type DefinitionLean = CompetencyDefinitionDoc & { createdAt: Date; updatedAt: Date };
type ObservationLean = CompetencyObservationDoc & { createdAt: Date; updatedAt: Date };
type LearnerLean = LearnerCompetencyDoc & { createdAt: Date; updatedAt: Date };

export class CompetencyConflictError extends Error {
  constructor(code: string) {
    super(`Competency ${code} already exists`);
    this.name = "CompetencyConflictError";
  }
}

export class CompetencyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompetencyValidationError";
  }
}

export interface CompetencyDefinitionDTO {
  code: string;
  domain: CompetencyDomain;
  level: CefrCode;
  name: string;
  description: string;
  performanceDescriptor: string;
  evidenceRequired: number;
  accuracyThreshold: number;
  contextsRequired: number;
  confidenceThreshold: number;
  positivePatterns: string[];
  negativePatterns: string[];
  exceptions: string[];
  prerequisites: string[];
  isCritical: boolean;
  isActive: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompetencyObservationDTO {
  id: string;
  observationKey: string;
  userId: string;
  competencyCode: string;
  sourceType: CompetencySourceType;
  sourceSessionId?: string;
  sourceTurnId?: string;
  contextKey: string;
  result: CompetencyResult;
  accuracy: number;
  confidence: number;
  independence: CompetencyIndependence;
  evidenceExcerpt: string;
  aiCallId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LearnerCompetencyDTO {
  id: string;
  userId: string;
  competencyCode: string;
  evidenceCount: number;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
  insufficientEvidenceCount: number;
  distinctContextCount: number;
  weightedAccuracy: number;
  confidence: number;
  criticalContradictionCount: number;
  status: CompetencyStatus;
  lastObservedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function toDefinitionDTO(doc: DefinitionLean): CompetencyDefinitionDTO {
  return {
    code: doc.code,
    domain: doc.domain as CompetencyDomain,
    level: doc.level as CefrCode,
    name: doc.name,
    description: doc.description,
    performanceDescriptor: doc.performanceDescriptor,
    evidenceRequired: doc.evidenceRequired,
    accuracyThreshold: doc.accuracyThreshold,
    contextsRequired: doc.contextsRequired,
    confidenceThreshold: doc.confidenceThreshold,
    positivePatterns: [...doc.positivePatterns],
    negativePatterns: [...doc.negativePatterns],
    exceptions: [...doc.exceptions],
    prerequisites: [...doc.prerequisites],
    isCritical: doc.isCritical,
    isActive: doc.isActive,
    createdBy: String(doc.createdBy),
    updatedBy: String(doc.updatedBy),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toObservationDTO(doc: ObservationLean): CompetencyObservationDTO {
  return {
    id: String(doc._id),
    observationKey: doc.observationKey,
    userId: String(doc.userId),
    competencyCode: doc.competencyCode,
    sourceType: doc.sourceType as CompetencySourceType,
    sourceSessionId: doc.sourceSessionId ? String(doc.sourceSessionId) : undefined,
    sourceTurnId: doc.sourceTurnId ? String(doc.sourceTurnId) : undefined,
    contextKey: doc.contextKey,
    result: doc.result as CompetencyResult,
    accuracy: doc.accuracy,
    confidence: doc.confidence,
    independence: doc.independence as CompetencyIndependence,
    evidenceExcerpt: doc.evidenceExcerpt,
    aiCallId: doc.aiCallId ? String(doc.aiCallId) : undefined,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toLearnerDTO(doc: LearnerLean): LearnerCompetencyDTO {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    competencyCode: doc.competencyCode,
    evidenceCount: doc.evidenceCount,
    positiveEvidenceCount: doc.positiveEvidenceCount,
    negativeEvidenceCount: doc.negativeEvidenceCount,
    insufficientEvidenceCount: doc.insufficientEvidenceCount,
    distinctContextCount: doc.distinctContextCount,
    weightedAccuracy: doc.weightedAccuracy,
    confidence: doc.confidence,
    criticalContradictionCount: doc.criticalContradictionCount,
    status: doc.status as CompetencyStatus,
    lastObservedAt: doc.lastObservedAt ? doc.lastObservedAt.toISOString() : undefined,
    version: doc.version,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

async function ensurePrerequisitesExist(codes: string[]): Promise<void> {
  const unique = Array.from(new Set(codes.map((code) => code.toUpperCase())));
  if (unique.length === 0) return;
  const count = await CompetencyDefinition.countDocuments({ code: { $in: unique } });
  if (count !== unique.length) throw new CompetencyValidationError("Unknown prerequisite code");
}

export interface DefinitionFilters {
  domain?: CompetencyDomain;
  level?: CefrCode;
  isActive?: boolean;
}

export async function listCompetencyDefinitions(
  filters?: DefinitionFilters,
): Promise<CompetencyDefinitionDTO[]> {
  await connectToDatabase();
  const query: Record<string, unknown> = {};
  if (filters?.domain) query.domain = filters.domain;
  if (filters?.level) query.level = filters.level;
  if (typeof filters?.isActive === "boolean") query.isActive = filters.isActive;
  const docs = await CompetencyDefinition.find(query)
    .sort({ level: 1, domain: 1, code: 1 })
    .lean<DefinitionLean[]>();
  return docs.map(toDefinitionDTO);
}

export async function getCompetencyDefinitionByCode(
  code: string,
): Promise<CompetencyDefinitionDTO | null> {
  await connectToDatabase();
  const doc = await CompetencyDefinition.findOne({ code: code.toUpperCase() }).lean<DefinitionLean | null>();
  return doc ? toDefinitionDTO(doc) : null;
}

export async function createCompetencyDefinition(
  input: unknown,
  actorId: string,
): Promise<CompetencyDefinitionDTO> {
  const parsed = createCompetencyDefinitionSchema.safeParse(input);
  if (!parsed.success) throw new CompetencyValidationError("Invalid competency definition");
  const data = parsed.data;

  await connectToDatabase();
  if (data.prerequisites.some((code) => code.toUpperCase() === data.code.toUpperCase())) {
    throw new CompetencyValidationError("A competency cannot list itself as a prerequisite");
  }
  await ensurePrerequisitesExist(data.prerequisites);

  const existing = await CompetencyDefinition.exists({ code: data.code });
  if (existing) throw new CompetencyConflictError(data.code);

  const actor = new mongoose.Types.ObjectId(actorId);
  try {
    const doc = await CompetencyDefinition.create({ ...data, createdBy: actor, updatedBy: actor });
    return toDefinitionDTO(doc.toObject() as DefinitionLean);
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new CompetencyConflictError(data.code);
    throw error;
  }
}

export async function updateCompetencyDefinition(
  code: string,
  input: unknown,
  actorId: string,
): Promise<CompetencyDefinitionDTO | null> {
  const parsed = updateCompetencyDefinitionSchema.safeParse(input);
  if (!parsed.success) throw new CompetencyValidationError("Invalid competency definition");
  const data = parsed.data;

  await connectToDatabase();
  if (data.prerequisites.some((prereq) => prereq.toUpperCase() === code.toUpperCase())) {
    throw new CompetencyValidationError("A competency cannot list itself as a prerequisite");
  }
  await ensurePrerequisitesExist(data.prerequisites);

  const doc = await CompetencyDefinition.findOneAndUpdate(
    { code: code.toUpperCase() },
    { $set: { ...data, updatedBy: new mongoose.Types.ObjectId(actorId) } },
    { new: true, runValidators: true },
  ).lean<DefinitionLean | null>();
  return doc ? toDefinitionDTO(doc) : null;
}

export interface ObservationPageOptions {
  limit?: number;
  skip?: number;
}

export async function getCompetencyObservations(
  userId: string,
  competencyCode: string,
  options?: ObservationPageOptions,
): Promise<CompetencyObservationDTO[]> {
  await connectToDatabase();
  const limit = Math.min(200, Math.max(1, options?.limit ?? 50));
  const docs = await CompetencyObservation.find({
    userId,
    competencyCode: competencyCode.toUpperCase(),
  })
    .sort({ createdAt: -1, _id: -1 })
    .skip(Math.max(0, options?.skip ?? 0))
    .limit(limit)
    .lean<ObservationLean[]>();
  return docs.map(toObservationDTO);
}

export async function rebuildLearnerCompetency(
  userId: string,
  competencyCode: string,
): Promise<LearnerCompetencyDTO> {
  await connectToDatabase();
  const code = competencyCode.toUpperCase();

  const definition = await CompetencyDefinition.findOne({ code }).lean<DefinitionLean | null>();
  const engineDefinition = {
    evidenceRequired: definition?.evidenceRequired ?? 5,
    accuracyThreshold: definition?.accuracyThreshold ?? 0.8,
    contextsRequired: definition?.contextsRequired ?? 2,
    confidenceThreshold: definition?.confidenceThreshold ?? 0.75,
    isCritical: definition?.isCritical ?? false,
  };

  const observations = await CompetencyObservation.find({ userId, competencyCode: code })
    .sort({ createdAt: 1, _id: 1 })
    .lean<ObservationLean[]>();

  const state = calculateLearnerCompetency(
    engineDefinition,
    observations.map((doc) => ({
      id: String(doc._id),
      createdAt: doc.createdAt,
      sourceType: doc.sourceType as CompetencySourceType,
      result: doc.result as CompetencyResult,
      accuracy: doc.accuracy,
      confidence: doc.confidence,
      independence: doc.independence as CompetencyIndependence,
      contextKey: doc.contextKey,
    })),
  );

  const previous = await LearnerCompetency.findOne({ userId, competencyCode: code })
    .select("version")
    .lean<{ version?: number } | null>();
  const version = (previous?.version ?? 0) + 1;

  const doc = await LearnerCompetency.findOneAndUpdate(
    { userId, competencyCode: code },
    {
      $set: {
        evidenceCount: state.evidenceCount,
        positiveEvidenceCount: state.positiveEvidenceCount,
        negativeEvidenceCount: state.negativeEvidenceCount,
        insufficientEvidenceCount: state.insufficientEvidenceCount,
        distinctContextCount: state.distinctContextCount,
        weightedAccuracy: state.weightedAccuracy,
        confidence: state.confidence,
        criticalContradictionCount: state.criticalContradictionCount,
        status: state.status,
        lastObservedAt: state.lastObservedAt,
        version,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean<LearnerLean | null>();

  return toLearnerDTO(doc as LearnerLean);
}

export async function createCompetencyObservation(input: unknown): Promise<{
  observation: CompetencyObservationDTO;
  learnerCompetency: LearnerCompetencyDTO;
  created: boolean;
}> {
  const parsed = createCompetencyObservationSchema.safeParse(input);
  if (!parsed.success) throw new CompetencyValidationError("Invalid observation");
  const data = parsed.data;
  const code = data.competencyCode.toUpperCase();

  await connectToDatabase();
  const definition = await CompetencyDefinition.findOne({ code, isActive: true })
    .select("_id")
    .lean();
  if (!definition) throw new CompetencyValidationError("Unknown or inactive competency");

  let created = true;
  let observation: CompetencyObservationDTO;
  try {
    const doc = await CompetencyObservation.create({
      observationKey: data.observationKey,
      userId: new mongoose.Types.ObjectId(data.userId),
      competencyCode: code,
      sourceType: data.sourceType,
      sourceSessionId: data.sourceSessionId
        ? new mongoose.Types.ObjectId(data.sourceSessionId)
        : undefined,
      sourceTurnId: data.sourceTurnId
        ? new mongoose.Types.ObjectId(data.sourceTurnId)
        : undefined,
      contextKey: data.contextKey,
      result: data.result,
      accuracy: data.accuracy,
      confidence: data.confidence,
      independence: data.independence,
      evidenceExcerpt: data.evidenceExcerpt,
      aiCallId: data.aiCallId ? new mongoose.Types.ObjectId(data.aiCallId) : undefined,
    });
    observation = toObservationDTO(doc.toObject() as ObservationLean);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    created = false;
    const existing = await CompetencyObservation.findOne({
      observationKey: data.observationKey,
    }).lean<ObservationLean | null>();
    if (!existing) throw error;
    observation = toObservationDTO(existing);
  }

  const learnerCompetency = await rebuildLearnerCompetency(data.userId, code);
  return { observation, learnerCompetency, created };
}

export async function listObservationsBySession(
  sourceSessionId: string,
): Promise<CompetencyObservationDTO[]> {
  await connectToDatabase();
  const docs = await CompetencyObservation.find({ sourceSessionId })
    .sort({ createdAt: 1, _id: 1 })
    .lean<ObservationLean[]>();
  return docs.map(toObservationDTO);
}

export async function getLearnerCompetency(
  userId: string,
  competencyCode: string,
): Promise<LearnerCompetencyDTO | null> {
  await connectToDatabase();
  const doc = await LearnerCompetency.findOne({
    userId,
    competencyCode: competencyCode.toUpperCase(),
  }).lean<LearnerLean | null>();
  return doc ? toLearnerDTO(doc) : null;
}

export async function listLearnerCompetencies(
  userId: string,
  filters?: { status?: CompetencyStatus },
): Promise<LearnerCompetencyDTO[]> {
  await connectToDatabase();
  const query: Record<string, unknown> = { userId };
  if (filters?.status) query.status = filters.status;
  const docs = await LearnerCompetency.find(query)
    .sort({ updatedAt: -1 })
    .lean<LearnerLean[]>();
  return docs.map(toLearnerDTO);
}
