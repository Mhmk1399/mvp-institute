import "server-only";

import mongoose from "mongoose";

import { env } from "@/lib/env";

/**
 * Cached Mongoose connection. Next.js hot-reloads modules in dev, which would
 * otherwise open a new connection on every change; we stash it on globalThis so
 * a single connection is reused.
 */
type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as unknown as {
  _mongoose?: MongooseCache;
};

const cache: MongooseCache =
  globalForMongoose._mongoose ?? { conn: null, promise: null };

globalForMongoose._mongoose = cache;

/** Connect once and return the shared Mongoose instance. */
export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose.connect(env.mongodbUri, {
      // Fail fast instead of hanging if the server is unreachable.
      serverSelectionTimeoutMS: 5000,
    });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
