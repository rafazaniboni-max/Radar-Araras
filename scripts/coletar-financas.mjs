import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { calcular, diaEmAraras, sessaoPublicaBetha, baixarExercicio, lerRespostaOficial } from './pagamentos.mjs';

const [origem, destino, fim] = process.argv.slice(2);
if (!origem || !destino || fim !== diaEmAraras(new Date())) {
  throw new Error('Informe as pastas de origem e destino e a data de hoje em Araras.');
}
const raw = resolve(origem);
await mkdir(raw, { recursive: true });
const diagnostico = [];
let gravacaoDiagnostico = Promise.resolve();
async function registrar(item) {
  diagnostico.push({ ...item, em: new Date().toISOString() });
  const conteudo = JSON.stringify(diagnostico, null, 2);
  gravacaoDiagnostico = gravacaoDiagnostico.then(() => writeFile(join(raw, 'diagnostico-financeiro.json'), conteudo));
  await gravacaoDiagnostico;
}
process.on('uncaughtExceptionMonitor', erro => console.error(`Coleta financeira interrompida: ${erro.message}`));
await registrar({conjunto:'acesso publico',situacao:'iniciado'});
const headers = await sessaoPublicaBetha();
await registrar({conjunto:'acesso publico',situacao:'concluido'});
const api = 'https://api.transparencia.betha.cloud/transparencia/api';

async function jsonOficial(caminho) {
  const resposta = await lerRespostaOficial(api + caminho, { headers }, `Consulta financeira ${caminho.split('?')[0]}`);
  if (resposta.status !== 200) throw new Error(`Consulta financeira indisponível (${resposta.status}).`);
  return JSON.parse(resposta.texto);
}

function listarConsultas(no) {
  if (Array.isArray(no)) return no.flatMap(listarConsultas);
  if (!no || typeof no !== 'object') return [];
  const consulta = no.titulo && no.exibeDadosAbertos ? [no] : [];
  return consulta.concat(Object.values(no).filter(valor => typeof valor === 'object').flatMap(listarConsultas));
}

const menus = await jsonOficial('/menu');
const consultas = listarConsultas(menus);
const contratos = consultas.filter(consulta => consulta.titulo === 'Contratos');
if (contratos.length !== 1 || !consultas.some(consulta => consulta.id === 392446)) {
  throw new Error('Os conjuntos oficiais de contratos e despesas não foram identificados.');
}
const filtro = await jsonOficial('/busca-textual/392446/filtro/anoExercicio/MAX?allConfigs=true&limit=100');
const anoFinal = Number(fim.slice(0, 4));
const anos = [...new Set(filtro.buckets.map(item => Number(item.description)))]
  .filter(ano => Number.isInteger(ano) && ano <= anoFinal).sort((a, b) => a - b);
for (let ano = 2024; ano <= anoFinal; ano++) {
  if (!anos.includes(ano)) throw new Error(`O portal deixou de informar o exercício ${ano}.`);
}
const arquivos = new Map();
for (let indice = 0; indice < anos.length; indice += 2) {
  const lote = await Promise.all(anos.slice(indice, indice + 2).map(async ano => {
    console.log(`Consultando execução de despesas de ${ano}.`);
    await registrar({conjunto:'despesas',ano,situacao:'iniciado'});
    const dados = await baixarExercicio(ano, headers).catch(async erro => {
      await registrar({conjunto:'despesas',ano,situacao:'falha',erro:erro.message});
      throw erro;
    });
    if (!Array.isArray(dados) || !dados.length) throw new Error(`Arquivo de despesas vazio em ${ano}.`);
    await writeFile(join(raw, `betha-execucao-despesas-${ano}.json`), JSON.stringify(dados));
    await registrar({conjunto:'despesas',ano,situacao:'concluido',registros:dados.length});
    return [ano, dados];
  }));
  for (const [ano, dados] of lote) arquivos.set(ano, dados);
}
for (let ano = 2025; ano <= anoFinal; ano++) {
  console.log(`Consultando contratos de ${ano}.`);
  await registrar({conjunto:'contratos',ano,situacao:'iniciado'});
  const dados = await baixarExercicio(ano, headers, contratos[0].id, 'ano').catch(async erro => {
    await registrar({conjunto:'contratos',ano,situacao:'falha',erro:erro.message});
    throw erro;
  });
  if (!Array.isArray(dados) || dados.some(registro => registro.nomeEntidade !== 'CAMARA MUNICIPAL DE ARARAS' || registro.ano !== ano)) {
    throw new Error(`Arquivo de contratos inválido para ${ano}.`);
  }
  await writeFile(join(raw, `betha-contratos-${ano}.json`), JSON.stringify(dados));
  await registrar({conjunto:'contratos',ano,situacao:'concluido',registros:dados.length});
  console.log(`Contratos de ${ano}: ${dados.length}.`);
}
const pagamentos = calcular(arquivos, fim, new Date().toISOString());
await writeFile(join(resolve(destino), 'pagamentos.js'), `globalThis.ARARAS_PAGAMENTOS = ${JSON.stringify(pagamentos)};\n`);
console.log(`Pagamentos consultados até ${fim}. Último lançamento em ${pagamentos.ultimaData}.`);
