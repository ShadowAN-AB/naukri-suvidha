/**
 * Everything this suite needs lives in services/notifications/.env.test, which
 * env.js loads when NODE_ENV is "test".
 */
export async function setup() {
  process.env.NODE_ENV = 'test';
}
