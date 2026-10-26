/**
 * Everything this suite needs lives in services/auth/.env.test, which env.js
 * loads when NODE_ENV is "test". Setting it here, before any application
 * module is imported, is all this has to do.
 */
export async function setup() {
  process.env.NODE_ENV = 'test';
}
