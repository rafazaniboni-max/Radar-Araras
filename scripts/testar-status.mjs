import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const contexto = vm.createContext({ Intl });
vm.runInContext(readFileSync(new URL('../dist/radar.js', import.meta.url), 'utf8'), contexto);
const tempo = vm.runInContext('tempoDesdeConferencia', contexto);
const base = '2026-11-19T10:00:00-03:00';
const instante = Date.parse(base);

test('selo mostra uma conferência recente sem inventar horas', () => {
  assert.equal(tempo(base, instante), 'agora');
  assert.equal(tempo(base, instante + 59000), 'agora');
  assert.equal(tempo(base, instante + 60000), 'há 1 minuto');
  assert.equal(tempo(base, instante + 120000), 'há 2 minutos');
});

test('selo passa de minutos para horas e dias com singular e plural', () => {
  assert.equal(tempo(base, instante + 3600000), 'há 1 hora');
  assert.equal(tempo(base, instante + 14 * 3600000), 'há 14 horas');
  assert.equal(tempo(base, instante + 86400000), 'há 1 dia');
  assert.equal(tempo(base, instante + 2 * 86400000), 'há 2 dias');
});

test('uma data inválida ou futura não gera um tempo de conferência falso', () => {
  assert.equal(tempo('sem data', instante), null);
  assert.equal(tempo(base, instante - 120000), null);
});
