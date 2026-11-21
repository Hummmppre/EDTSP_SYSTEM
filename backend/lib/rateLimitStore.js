const mongoose = require("mongoose");

const COLLECTION_NAME = "rateLimitCounters";

// Set RATE_LIMIT_STORE=memory to force local counters in tests. Production
// always uses MongoDB, and any environment with a configured database uses it
// too, so multiple server instances share one set of limits.
function shouldUseMongoStore() {
  if (process.env.RATE_LIMIT_STORE) {
    return process.env.RATE_LIMIT_STORE.toLowerCase() === "mongo";
  }

  if (process.env.NODE_ENV === "test") return false;

  return (
    process.env.NODE_ENV === "production" || Boolean(process.env.MONGODB_URI)
  );
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeResult(result) {
  if (!result) return null;

  return result.value || result;
}

// Implements the express-rate-limit Store interface. Each key keeps a count
// and an expiry; the first hit starts the window, matching the memory store.
class MongoRateLimitStore {
  constructor({ prefix, windowMs }) {
    this.prefix = prefix;
    this.windowMs = windowMs;
    this.indexPromise = null;
  }

  init(options = {}) {
    if (options.windowMs) this.windowMs = options.windowMs;
  }

  collection() {
    const db = mongoose.connection.db;

    if (!db) {
      throw new Error("MongoDB is not connected for rate limiting.");
    }

    return db.collection(COLLECTION_NAME);
  }

  async ensureIndex() {
    if (!this.indexPromise) {
      this.indexPromise = this.collection()
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
        .catch((error) => {
          // Retry on the next request instead of caching a failed index build.
          this.indexPromise = null;
          throw error;
        });
    }

    await this.indexPromise;
  }

  async increment(key) {
    await this.ensureIndex();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.windowMs);
    const expired = {
      $or: [
        { $eq: [{ $type: "$expiresAt" }, "missing"] },
        { $lte: ["$expiresAt", now] },
      ],
    };

    let result;

    try {
      result = await this.collection().findOneAndUpdate(
        { _id: `${this.prefix}:${key}` },
        [
          {
            $set: {
              totalHits: {
                $cond: [
                  expired,
                  1,
                  { $add: [{ $ifNull: ["$totalHits", 0] }, 1] },
                ],
              },
              expiresAt: {
                $cond: [expired, expiresAt, "$expiresAt"],
              },
            },
          },
        ],
        { upsert: true, returnDocument: "after" },
      );
    } catch (error) {
      // Two first requests for a new key can race on the upsert.
      if (error && error.code === 11000) {
        return this.increment(key);
      }

      throw error;
    }

    const document = normalizeResult(result);

    if (!document) {
      throw new Error("Unable to increment the rate-limit counter.");
    }

    return {
      totalHits: document.totalHits,
      resetTime: document.expiresAt,
    };
  }

  async get(key) {
    const document = await this.collection().findOne({
      _id: `${this.prefix}:${key}`,
    });

    if (!document || !document.expiresAt) return undefined;

    if (new Date(document.expiresAt).getTime() <= Date.now()) {
      return undefined;
    }

    return {
      totalHits: document.totalHits,
      resetTime: document.expiresAt,
    };
  }

  async decrement(key) {
    await this.collection().updateOne(
      { _id: `${this.prefix}:${key}` },
      { $inc: { totalHits: -1 } },
    );
  }

  async resetKey(key) {
    await this.collection().deleteOne({ _id: `${this.prefix}:${key}` });
  }

  async resetAll() {
    await this.collection().deleteMany({
      _id: { $regex: `^${escapeRegex(this.prefix)}:` },
    });
  }

  shutdown() {}
}

class MemoryRateLimitStore {
  constructor({ windowMs }) {
    this.windowMs = windowMs;
    this.counters = new Map();
  }

  init(options = {}) {
    if (options.windowMs) this.windowMs = options.windowMs;
  }

  read(key) {
    const counter = this.counters.get(key);

    if (!counter) return undefined;

    if (counter.resetTime.getTime() <= Date.now()) {
      this.counters.delete(key);
      return undefined;
    }

    return counter;
  }

  async increment(key) {
    const now = Date.now();
    let counter = this.read(key);

    if (!counter) {
      counter = {
        totalHits: 0,
        resetTime: new Date(now + this.windowMs),
      };
      this.counters.set(key, counter);
    }

    counter.totalHits += 1;

    return {
      totalHits: counter.totalHits,
      resetTime: counter.resetTime,
    };
  }

  async get(key) {
    const counter = this.read(key);

    if (!counter) return undefined;

    return {
      totalHits: counter.totalHits,
      resetTime: counter.resetTime,
    };
  }

  async decrement(key) {
    const counter = this.read(key);

    if (!counter) return;

    counter.totalHits = Math.max(counter.totalHits - 1, 0);
  }

  async resetKey(key) {
    this.counters.delete(key);
  }

  async resetAll() {
    this.counters.clear();
  }

  shutdown() {}
}

// express-rate-limit creates its own in-memory store when this returns
// undefined, which is what we want outside production.
function createRateLimitStore({ prefix, windowMs }) {
  if (!shouldUseMongoStore()) return undefined;

  return new MongoRateLimitStore({ prefix, windowMs });
}

function createCounter({ prefix, windowMs }) {
  if (!shouldUseMongoStore()) {
    return new MemoryRateLimitStore({ windowMs });
  }

  return new MongoRateLimitStore({ prefix, windowMs });
}

module.exports = {
  createCounter,
  createRateLimitStore,
  shouldUseMongoStore,
};
