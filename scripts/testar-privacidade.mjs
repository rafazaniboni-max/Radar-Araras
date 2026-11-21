import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const origem = readFileSync(new URL('../dist/privacidade.js', import.meta.url), 'utf8');
function pagina(opcionais = true) {
  const carregados = [], comandos = [], googleBotao = { hidden: true, style: {}, eventos: {}, addEventListener(nome, funcao) { this.eventos[nome] = funcao; } };
  const doc = { documentElement: { dataset: { analytics: 'G-TESTE' } }, referrer: '', head: { append: elemento => carregados.push(elemento) }, body: { append() {} } };
  let marcador = { getAttribute: () => 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-teste', remove() { marcador = null; } };
  doc.querySelector = seletor => seletor === 'script[data-publicidade]' ? marcador : null;
  doc.querySelectorAll = seletor => seletor === '[data-preferencias-google]' ? [googleBotao] : [];
  doc.createElement = () => ({ setAttribute() {}, querySelector() { return {}; } });
  const loc = { hostname: 'radarararas.com.br', origin: 'https://radarararas.com.br', pathname: '/', reload() { loc.recarregamentos++; }, recarregamentos: 0 };
  const contexto = vm.createContext({ document: doc, location: loc, localStorage: { getItem: () => JSON.stringify({ opcionais }), setItem() {} }, URL, console, gtag: (...args) => comandos.push(args) });
  vm.runInContext(origem, contexto);
  const apiPronta = () => {
    contexto.__tcfapi = (metodo, versao, callback) => { assert.equal(metodo, 'addEventListener'); contexto.eventoTCF = callback; };
    contexto.googlefc.callbackQueue.find(item => item.CONSENT_API_READY)?.CONSENT_API_READY();
  };
  const sinais = (valor) => {
    contexto.googlefc.getGoogleConsentModeValues = () => ({ adStoragePurposeConsentStatus: valor, adUserDataPurposeConsentStatus: valor, adPersonalizationPurposeConsentStatus: valor, analyticsStoragePurposeConsentStatus: valor });
    contexto.googlefc.callbackQueue.find(item => item.CONSENT_MODE_DATA_READY).CONSENT_MODE_DATA_READY();
  };
  return { contexto, carregados, comandos, googleBotao, loc, apiPronta, sinais, analytics: () => carregados.filter(x => x.src?.includes('googletagmanager')).length };
}

test('recusa local não carrega AdSense nem Analytics', () => {
  const p = pagina(false);
  assert.equal(p.carregados.length, 0);
  assert.equal(p.contexto.googlefc, undefined);
});
test('permissão local carrega AdSense, mas aguarda CMP para medir', () => {
  const p = pagina();
  assert.equal(p.carregados.length, 1);
  assert.equal(p.analytics(), 0);
  assert.equal(p.comandos[0][2].analytics_storage, 'denied');
  p.sinais(0);
  assert.equal(p.analytics(), 0);
});
test('recusa regional mantém Analytics bloqueado', () => {
  const p = pagina();
  p.sinais(2);
  assert.equal(p.analytics(), 0);
  assert.equal(p.contexto.document.documentElement.dataset.cmpAnalytics, 'bloqueado');
});
test('consentimento concedido ou regra inaplicável permite medir uma única vez', () => {
  for (const valor of [1, 3]) {
    const p = pagina();
    p.sinais(valor);
    p.sinais(valor);
    assert.equal(p.analytics(), 1);
    assert.equal(p.comandos.filter(x => x[0] === 'config').length, 1);
  }
});
test('retirada de consentimento bloqueia sinais e recarrega', () => {
  const p = pagina();
  p.sinais(1);
  p.sinais(2);
  assert.equal(p.loc.recarregamentos, 1);
  assert.equal(p.comandos.at(-1)[2].analytics_storage, 'denied');
});
test('regra europeia oferece acesso à revogação; região não abrangida mantém oculto', () => {
  const p = pagina();
  p.apiPronta();
  p.contexto.eventoTCF({ gdprApplies: false, eventStatus: 'tcloaded' }, true);
  assert.equal(p.googleBotao.hidden, true);
  p.contexto.eventoTCF({ gdprApplies: true, eventStatus: 'tcloaded' }, true);
  assert.equal(p.googleBotao.hidden, false);
  p.googleBotao.eventos.click();
  let aberto = false;
  p.contexto.googlefc.showRevocationMessage = () => { aberto = true; };
  p.contexto.googlefc.callbackQueue.at(-1).CONSENT_API_READY();
  assert.equal(aberto, true);
});
