// Bundles the widget lab into dist/widget-bundle.js (IIFE, so a static page can
// load it over file://). apexcharts & leaflet are heavy, so we don't bundle them:
// the chart/map pages pull them from a CDN as globals (window.ApexCharts /
// window.L), and this build aliases the widgets' dynamic `import('apexcharts')` /
// `import('leaflet')` to those globals. Their `?raw` stylesheets are inlined from
// node_modules so the widget shadow roots still get them.
//
// Paths are resolved from this file's location (import.meta.dir), so it runs the
// same regardless of the caller's cwd.
import type { BunPlugin } from 'bun';
import { join } from 'node:path';

const SRC = import.meta.dir; // …/widget-lab/src
const ROOT = join(SRC, '..'); // …/widget-lab
const SHARED_WIDGETS = join(ROOT, '../../../shared/widgets'); // monorepo shared/widgets

const CDN_GLOBAL: Record<string, string> = { apexcharts: 'ApexCharts', leaflet: 'L' };

const labCdn: BunPlugin = {
  name: 'lab-cdn',
  setup(build) {
    // import('apexcharts') / import('leaflet') -> the CDN-provided global.
    build.onResolve({ filter: /^(apexcharts|leaflet)$/ }, (a) => ({ path: a.path, namespace: 'cdn-global' }));
    build.onLoad({ filter: /.*/, namespace: 'cdn-global' }, (a) => ({
      loader: 'js',
      // No throw at module top-level: evaluates lazily on first use (a chart or
      // map instance), and only those pages load the CDN <script>.
      contents: `export default globalThis.${CDN_GLOBAL[a.path]};`,
    }));
    // `import css from '<pkg>/...css?raw'` -> inline the file's text.
    build.onResolve({ filter: /\?raw$/ }, (a) => ({
      path: Bun.resolveSync(a.path.replace(/\?raw$/, ''), a.resolveDir),
      namespace: 'raw-text',
    }));
    build.onLoad({ filter: /.*/, namespace: 'raw-text' }, async (a) => ({
      loader: 'js',
      contents: `export default ${JSON.stringify(await Bun.file(a.path).text())};`,
    }));
  },
};

async function bundle(): Promise<boolean> {
  const res = await Bun.build({ entrypoints: [join(SRC, 'entry.ts')], format: 'iife', plugins: [labCdn] });
  if (!res.success) {
    for (const log of res.logs) console.error(String(log));
    return false;
  }
  await Bun.write(join(ROOT, 'dist/widget-bundle.js'), res.outputs[0]!);
  console.log(`built dist/widget-bundle.js · ${new Date().toLocaleTimeString()}`);
  return true;
}

const ok = await bundle();

if (process.argv.includes('--watch')) {
  const { watch } = await import('node:fs');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const queue = () => { clearTimeout(timer); timer = setTimeout(bundle, 80); };
  for (const dir of [SRC, SHARED_WIDGETS]) {
    watch(dir, { recursive: true }, (_e, file) => {
      const f = String(file ?? '');
      if (f && !f.includes('node_modules') && /\.(ts|css)$/.test(f)) queue();
    });
  }
  console.log('watching for changes… (ctrl-c to stop)');
} else if (!ok) {
  process.exit(1);
}
