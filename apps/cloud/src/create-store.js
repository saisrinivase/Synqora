import { SynqoraPostgresStore } from './postgres-store.js';
import { SynqoraStore } from './store.js';

export async function createStoreFromEnv() {
  const storageMode = process.env.SYNQORA_STORAGE || 'memory';

  if (storageMode === 'postgres' || storageMode === 'internal_postgres') {
    return new SynqoraPostgresStore();
  }

  return new SynqoraStore();
}
