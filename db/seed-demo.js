import { seedPostgresDemoData } from '../apps/cloud/src/postgres-store.js';

async function main() {
  await seedPostgresDemoData();
  console.log('Synqora demo data seeded.');
}

main().catch((error) => {
  console.error(`Demo seed failed: ${error.message}`);
  process.exitCode = 1;
});
