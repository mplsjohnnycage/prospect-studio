import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const cssDir = join(process.cwd(), '.next/static/css');
const css = readdirSync(cssDir)
  .filter((name) => name.endsWith('.css'))
  .map((name) => readFileSync(join(cssDir, name), 'utf8'))
  .join('\n');

assert.match(css, /\.flex\s*\{/u, 'Tailwind display utilities must be compiled');
assert.match(css, /\.bg-background(?:,|\s*\{)/u, 'Theme background utility must be compiled');
assert.match(css, /\.bg-primary(?:,|\s*\{)/u, 'Theme primary utility must be compiled');
assert.doesNotMatch(css, /@theme\s+inline\b/u, 'Raw Tailwind theme directives must never ship');
assert.doesNotMatch(css, /@apply\b/u, 'Raw Tailwind apply directives must never ship');
console.log('Compiled CSS contract passed: utilities, theme rules, and directives');
