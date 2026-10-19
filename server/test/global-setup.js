/**
 * Everything the suite needs lives in server/.env.test, which config/env.js
 * loads when NODE_ENV is "test". Setting it here, before any application
 * module is imported, is all this has to do.
 */
export async function setup() {
  process.env.NODE_ENV = 'test';
}
