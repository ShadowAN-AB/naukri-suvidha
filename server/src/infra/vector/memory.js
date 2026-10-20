import { VectorIndex, cosine } from './VectorIndex.js';
import { logger } from '../../config/logger.js';

/**
 * Reads the candidate vectors out of MongoDB and ranks them in process.
 *
 * This is honest about what it is: a linear scan. At a campus's scale - a few
 * hundred resumes of 768 floats - that is well under a millisecond of
 * arithmetic, and the database round trip dominates. It stops being the right
 * answer somewhere in the tens of thousands, which is the point at which Atlas
 * Vector Search earns its place.
 */
export class MemoryVectorIndex extends VectorIndex {
  constructor(model, { field = 'embedding' } = {}) {
    super();
    this.Model = model;
    this.field = field;
  }

  async search({ queryVector, filter = {}, limit = 10 }) {
    const started = Date.now();

    const candidates = await this.Model.find(
      { ...filter, [this.field]: { $ne: null, $exists: true } },
      { [this.field]: 1 },
    ).lean();

    const scored = [];
    for (const doc of candidates) {
      const vector = doc[this.field];
      if (!vector?.length) continue;
      try {
        scored.push({ _id: doc._id, score: cosine(queryVector, vector) });
      } catch (err) {
        // One bad vector should not fail the whole search.
        logger.warn({ id: String(doc._id), err: err.message }, 'skipping unusable vector');
      }
    }

    scored.sort((a, b) => b.score - a.score);
    logger.debug(
      { scanned: scored.length, ms: Date.now() - started },
      'in-memory vector search',
    );
    return scored.slice(0, limit);
  }
}
