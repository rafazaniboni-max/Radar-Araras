import test from 'node:test';
import assert from 'node:assert/strict';
import { calcular, lerRespostaOficial } from './pagamentos.mjs';

const esperaNula = async () => {};
const registro = alteracoes => ({ numeroEmpenho:1, anoExercicio:2026, anoCadastro:2026,
  nomeEntidade:'CAMARA MUNICIPAL DE ARARAS', mascaraElemento:'31901175000000',
  dataEmpenho:'2026-11-13', pagamentos:[], valorPagoEmpenho:100, ...alteracoes });
const calcularUm = dados => calcular(new Map([[2026,dados]]),'2026-11-19','2026-11-19T12:00:00Z');

test('repete falha de rede e lê a resposta completa', async () => {
  let chamadas=0;
  const resposta=await lerRespostaOficial('https://fonte.example',{},'Exportação de teste',{
    esperar:esperaNula,fetchImpl:async()=>{ if(++chamadas===1) throw new TypeError('rede'); return new Response('{"ok":true}'); }
  });
  assert.equal(chamadas,2);assert.equal(JSON.parse(resposta.texto).ok,true);
});

test('repete erro temporário HTTP 503', async () => {
  let chamadas=0;
  const resposta=await lerRespostaOficial('https://fonte.example',{},'Teste 503',{
    esperar:esperaNula,fetchImpl:async()=>new Response('ok',{status:++chamadas===1?503:200})
  });
  assert.equal(chamadas,2);assert.equal(resposta.status,200);
});

test('repete download cujo corpo foi interrompido', async () => {
  let chamadas=0;
  const resposta=await lerRespostaOficial('https://fonte.example',{},'Download de teste',{
    esperar:esperaNula,fetchImpl:async()=>++chamadas===1
      ? {status:200,headers:new Headers(),text:async()=>{throw new DOMException('demora','TimeoutError');}}
      : new Response('completo')
  });
  assert.equal(chamadas,2);assert.equal(resposta.texto,'completo');
});

test('erro permanente HTTP 403 não cria repetição infinita', async () => {
  let chamadas=0;
  const resposta=await lerRespostaOficial('https://fonte.example',{},'Teste 403',{
    esperar:esperaNula,fetchImpl:async()=>{chamadas++;return new Response('bloqueado',{status:403});}
  });
  assert.equal(chamadas,1);assert.equal(resposta.status,403);
});

test('falha definitiva identifica o exercício sem expor URL assinada', async () => {
  let chamadas=0;
  await assert.rejects(lerRespostaOficial('https://fonte.example?token=SEGREDO',{},'Download do exercício 2026',{
    esperar:esperaNula,fetchImpl:async()=>{chamadas++;throw new TypeError('SEGREDO');}
  }),erro=>erro.message.includes('2026')&&!erro.message.includes('SEGREDO'));
  assert.equal(chamadas,3);
});

test('empenho sem valor e sem parcelas é identificado sem inventar zero',()=>{
  const dados=calcularUm([registro({}),registro({numeroEmpenho:2,valorPagoEmpenho:null})]);
  assert.equal(dados.totais.vereadores,10000);assert.equal(dados.semValor,1);
  assert.equal(dados.empenhosConferidos['2/2026'].valorPagoCentavos,null);
  assert.equal(dados.empenhosConferidos['2/2026'].pagoNoRecorteCentavos,null);
  assert.equal(dados.semValorDetalhes[0].empenho,'2/2026');
});

test('pagamento com parcela e sem consolidado continua bloqueado',()=>{
  assert.throws(()=>calcularUm([registro({valorPagoEmpenho:null,pagamentos:[{dataPagamento:'2026-11-18',valorPagamento:100}]})]),/falta o valor pago consolidado/);
});

test('a soma do recorte distingue restos anteriores pagos desde 2025',()=>{
  const dados=calcular(new Map([[2024,[registro({anoExercicio:2024,anoCadastro:2024,dataEmpenho:'2024-12-12',valorPagoEmpenho:150,
    valorPagoRestosEmpenho:50,pagamentos:[{dataPagamento:'2025-01-10',valorPagamento:50}]})]]]),'2026-11-19','2026-11-19T12:00:00Z');
  assert.equal(dados.totais.vereadores,5000);
  assert.equal(dados.empenhosConferidos['1/2024'].pagoNoRecorteCentavos,5000);
});

test('exportação vazia ou identificadores duplicados continuam bloqueados',()=>{
  assert.throws(()=>calcularUm([]),/vazia/);
  assert.throws(()=>calcularUm([registro({}),registro({})]),/inesperado/);
});
