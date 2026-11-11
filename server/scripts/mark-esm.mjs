/**
 * Writes an ESM marker into the compiled output directory.
 *
 * Vercel's Express service copies the backend build into a function bundle and
 * executes the entry as `/var/task/app.js`. Nothing in that bundle declares the
 * module system unless we ship one, so Node defaults to CommonJS and the first
 * `import` throws. `server/package.json` says `"type": "module"`, but it is not
 * part of the deployed artifact — this file makes the intent travel with the
 * code.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`);

console.log('Wrote ESM marker to dist/package.json');
