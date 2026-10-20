import { VectorIndex } from './VectorIndex.js';

/**
 * Atlas Vector Search. Requires a search index defined on the collection -
 * it is not created by Mongoose and has to exist before this runs:
 *
 *   { "fields": [{ "type": "vector", "path": "embedding",
 *                  "numDimensions": 768, "similarity": "cosine" }] }
 *
 * Untested here: a standalone mongod rejects $vectorSearch, so this path only
 * runs against Atlas. The memory implementation is what development uses.
 */
export class AtlasVectorIndex extends VectorIndex {
  constructor(model, { indexName, field = 'embedding' } = {}) {
    super();
    this.Model = model;
    this.indexName = indexName;
    this.field = field;
  }

  async search({ queryVector, filter = {}, limit = 10 }) {
    const results = await this.Model.aggregate([
      {
        $vectorSearch: {
          index: this.indexName,
          path: this.field,
          queryVector,
          // Atlas searches a wider pool than it returns; ten times the limit
          // is the documented starting point for recall.
          numCandidates: Math.max(100, limit * 10),
          limit,
          ...(Object.keys(filter).length ? { filter } : {}),
        },
      },
      { $project: { _id: 1, score: { $meta: 'vectorSearchScore' } } },
    ]);

    return results;
  }
}
