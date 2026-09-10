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
const commissionsMigration = fs.readFileSync(
  path.resolve(
    here,
    '../../supabase/migrations/20260910204859_add_v4_finance_commissions_by_person.sql',
  ),
  'utf8',
);

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

test('hidden login cannot be overridden by the login display rule', () => {
  assert.match(html, /\.hidden\s*\{\s*display\s*:\s*none\s*!important\s*\}/);
});

test('production preview preserves the approved UX v3 structure', () => {
  assert.match(html, /Homologação UX — fluxo real/);
  assert.match(html, /class="bottom"/);
  assert.match(html, />Home<\/button>/);
  assert.match(html, />Pessoas<\/button>/);
  assert.match(html, />Agenda<\/button>/);
  assert.match(html, />Financeiro<\/button>/);
  assert.match(html, />Menu<\/button>/);
  assert.match(html, /Todas as áreas/);
});

test('manual entry keeps the approved three-step operational order', () => {
  const receipt = html.indexOf('<strong>Recebimento</strong>');
  const coverage = html.indexOf('<strong>O que este pagamento cobre?</strong>');
  const payment = html.indexOf('<strong>Situação do pagamento</strong>');
  assert.ok(receipt >= 0 && coverage > receipt && payment > coverage);
  assert.match(html, /Nome completo de quem pagou/);
  assert.match(html, /É para quantas pessoas\?/);
  assert.match(html, /Nome completo do beneficiário/);
  assert.match(html, /Resumo antes de salvar/);
});

test('finance filter keeps the approved labels', () => {
  assert.match(html, /Data de início/);
  assert.match(html, /Data final/);
  assert.match(html, /Considerar data de/);
});

test('Home keeps the four V3 quick-access actions', () => {
  assert.match(html, /data-quick="new-client"[^>]*><b>Novo cliente/);
  assert.match(html, /data-quick="new-appointment"[^>]*><b>Agendar consulta/);
  assert.match(html, /data-quick="new-work"[^>]*><b>Novo trabalho/);
  assert.match(html, /data-quick="new-payment"[^>]*><b>Lançar pagamento/);
});

test('payment association and manual entry remain visible with zero pending items', () => {
  assert.match(html, /id="pendingPanel" class="panel"/);
  assert.match(html, /\+ Lançamento manual/);
  assert.match(html, /Nenhum pagamento aguardando associação neste período/);
  assert.doesNotMatch(html, /pendingPanel'\)\.classList\.toggle\('hidden'/);
});

test('finance identifies open and paid commissions by recipient', () => {
  assert.match(html, /dueCommissionsByPerson/);
  assert.match(html, /paidCommissionsByPerson/);
  assert.match(commissionsMigration, /coalesce\(b\.full_name,r\.full_name,'Sem identificação'\)/);
  assert.match(commissionsMigration, /upper\(coalesce\(c\.status,''\)\)='DUE'/);
  assert.match(commissionsMigration, /upper\(coalesce\(c\.status,''\)\)='PAID'/);
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
