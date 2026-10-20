/**
 * Nearest-neighbour search over stored vectors.
 *
 * Two implementations behind one interface, for the same reason as storage and
 * the language model: development runs on a standalone mongod, which has no
 * $vectorSearch, and production runs on Atlas, which does. Nothing above this
 * interface knows which one it got.
 */
export class VectorIndex {
  /**
   * @param {object} _opts
   * @param {number[]} _opts.queryVector
   * @param {object} _opts.filter   a Mongoose filter applied before ranking
   * @param {number} _opts.limit
   * @returns {Promise<Array<{ _id: any, score: number }>>} best first
   */
  async search(_opts) {
    throw new Error('VectorIndex.search is not implemented');
  }
}

/**
 * Cosine similarity. Both vectors come from the same model, so they have the
 * same dimension; a mismatch means two different models' vectors got mixed,
 * which is a bug worth surfacing rather than silently scoring as zero.
 */
export function cosine(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions differ (${a.length} vs ${b.length}) - mixed embedding models?`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
