import { build } from 'esbuild';
import fs from 'node:fs';

// Remove legacy unbundled api/index.ts if present so @vercel/node uses the self-contained ESM bundle api/index.js
if (fs.existsSync('api/index.ts')) {
  fs.unlinkSync('api/index.ts');
}

await build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'api/index.js',
  packages: 'external',
  define: {
    'process.env.VERCEL': '"1"',
    'process.env.NODE_ENV': '"production"'
  },
  banner: {
    js: '// Pre-bundled Vercel Serverless Function entrypoint generated from server.ts'
  }
});

console.log('✓ Built api/index.js for Vercel Serverless Function deployment');
