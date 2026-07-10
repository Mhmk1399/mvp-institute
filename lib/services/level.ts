import "server-only";

import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/db/mongoose";
import { Level, type CEFRCode, type LevelDoc } from "@/lib/models/level";
import type { CreateLevelInput, UpdateLevelInput } from "@/lib/schemas/level";

/** Thrown when creating a Level whose code already exists. */
export class LevelConflictError extends Error {
  constructor(code: string) {
    super(`Level ${code} already exists`);
    this.name = "LevelConflictError";
  }
}

export interface LevelDTO {
  code: CEFRCode;
  name: string;
  description: string;
  goals: {
    grammar: string[];
    vocabulary: string[];
    functions: string[];
  };
  canDoStatements: string[];
  passThreshold: number;
  isActive: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

function toDTO(doc: LevelDoc): LevelDTO {
  return {
    code: doc.code as CEFRCode,
    name: doc.name,
    description: doc.description,
    goals: {
      grammar: [...doc.goals.grammar],
      vocabulary: [...doc.goals.vocabulary],
      functions: [...doc.goals.functions],
    },
    canDoStatements: [...doc.canDoStatements],
    passThreshold: doc.passThreshold,
    isActive: doc.isActive,
    createdBy: String(doc.createdBy),
    updatedBy: String(doc.updatedBy),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** All levels in CEFR order (A1…C2, which is also lexicographic order). */
export async function listLevels(): Promise<LevelDTO[]> {
  await connectToDatabase();
  const docs = await Level.find().sort({ code: 1 }).lean<LevelDoc[]>();
  return docs.map(toDTO);
}

export async function getLevelByCode(code: string): Promise<LevelDTO | null> {
  await connectToDatabase();
  const doc = await Level.findOne({ code }).lean<LevelDoc | null>();
  return doc ? toDTO(doc) : null;
}

export async function createLevel(
  input: CreateLevelInput,
  actorId: string,
): Promise<LevelDTO> {
  await connectToDatabase();
  const existing = await Level.exists({ code: input.code });
  if (existing) throw new LevelConflictError(input.code);

  const actor = new mongoose.Types.ObjectId(actorId);
  try {
    const doc = await Level.create({ ...input, createdBy: actor, updatedBy: actor });
    return toDTO(doc.toObject() as LevelDoc);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
    ) {
      throw new LevelConflictError(input.code);
    }
    throw error;
  }
}

export async function updateLevel(
  code: string,
  input: UpdateLevelInput,
  actorId: string,
): Promise<LevelDTO | null> {
  await connectToDatabase();
  const doc = await Level.findOneAndUpdate(
    { code },
    { $set: { ...input, updatedBy: new mongoose.Types.ObjectId(actorId) } },
    { new: true, runValidators: true },
  ).lean<LevelDoc | null>();
  return doc ? toDTO(doc) : null;
}
