/**
 * DirectAdmin / cPanel Node.js Application startup file.
 *
 * In DirectAdmin → Node.js App set:
 *   Application startup file = app.js
 *   Application root         = folder that contains this file (project / package root)
 *   Node.js version          = 18.x or 20.x LTS
 *
 * Lives under deploy/directadmin/ so Vite does not bundle it.
 * `pnpm run pack:directadmin` copies this to the package root as app.js.
 */
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.join(here, 'dist/server/server/index.js'), // when app.js is at package root
  path.join(here, '../../dist/server/server/index.js'), // when run from deploy/directadmin/
];

const entry = candidates.find((candidate) => existsSync(candidate));
if (!entry) {
  console.error(
    'Cannot find dist/server/server/index.js. Run `pnpm run build:backend` (or pack:directadmin) first.'
  );
  process.exit(1);
}

await import(pathToFileURL(entry).href);
