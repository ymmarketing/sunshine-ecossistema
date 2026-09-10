import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(here, '../../v4-preview/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

test('preview inline JavaScript parses without syntax errors', () => {
  assert.ok(scripts.length > 0, 'inline app script must exist');
  for (const script of scripts) assert.doesNotThrow(() => new Function(script));
});

test('login submit is intercepted and reports failures', () => {
  assert.match(html, /loginForm[^\n]*|getElementById\('loginForm'\)/);
  assert.match(html, /preventDefault\(\)/);
  assert.match(html, /signInWithPassword/);
  assert.match(html, /loginMsg/);
  assert.match(html, /Entrando\.\.\./);
});
