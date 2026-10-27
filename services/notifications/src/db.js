import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

/** Connects to this service's own database: notifications and its retry queue. */
export async function connectDb() {
  mongoose.connection.on('connected', () => logger.info('mongodb connected'));
  mongoose.connection.on('disconnected', () => logger.warn('mongodb disconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'mongodb error'));

  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000, maxPoolSize: 10 });
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.connection.close(false);
}

/** 1 = connected, per mongoose.ConnectionStates */
export function dbIsUp() {
  return mongoose.connection.readyState === 1;
}
