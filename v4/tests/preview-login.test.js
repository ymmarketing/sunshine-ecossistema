import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(here, '../../v4-preview/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const receivablesMigrationPath = path.resolve(
  here,
  '../../supabase/migrations/20260910182531_fix_v4_receivables_obligation_join.sql',
);
const receivablesMigration = fs.readFileSync(receivablesMigrationPath, 'utf8');

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

test('secondary bootstrap failures keep the authenticated application open', () => {
  assert.match(html, /Promise\.allSettled/);
  assert.match(html, /operationalError/);
});

test('receivables resolves contract item through its obligation', () => {
  assert.match(
    receivablesMigration,
    /join sunshine_v4\.obligations o on o\.id = r\.obligation_id/,
  );
  assert.match(
    receivablesMigration,
    /join sunshine_v4\.contract_items i on i\.id = o\.contract_item_id/,
  );
  assert.doesNotMatch(
    receivablesMigration,
    /join sunshine_v4\.contract_items i on i\.id\s*=\s*r\.contract_item_id/,
  );
});
