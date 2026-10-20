import { env } from '../../config/env.js';
import { MemoryVectorIndex } from './memory.js';
import { AtlasVectorIndex } from './atlas.js';

/**
 * One index per collection. Which implementation is decided once, by
 * VECTOR_INDEX, exactly as STORAGE_PROVIDER and LLM_PROVIDER are.
 */
export function getVectorIndex(model, { indexName } = {}) {
  return env.VECTOR_INDEX === 'atlas'
    ? new AtlasVectorIndex(model, { indexName })
    : new MemoryVectorIndex(model);
}

export { cosine, VectorIndex } from './VectorIndex.js';
