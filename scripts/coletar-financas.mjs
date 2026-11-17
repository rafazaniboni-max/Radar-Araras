import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { calcular, diaEmAraras, sessaoPublicaBetha, baixarExercicio } from './pagamentos.mjs';

const [origem, destino, fim] = process.argv.slice(2);
if (!origem || !destino || fim !== diaEmAraras(new Date())) {
  throw new Error('Informe as pastas de origem e destino e a data de hoje em Araras.');
}
const raw = resolve(origem);
await mkdir(raw, { recursive: true });
const headers = await sessaoPublicaBetha();
const api = 'https://api.transparencia.betha.cloud/transparencia/api';

async function jsonOficial(caminho) {
  const resposta = await fetch(api + caminho, { headers, signal: AbortSignal.timeout(25000) });
  if (!resposta.ok) throw new Error(`Consulta financeira indisponível (${resposta.status}).`);
  return resposta.json();
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
for (let indice = 0; indice < anos.length; indice += 3) {
  const lote = await Promise.all(anos.slice(indice, indice + 3).map(async ano => {
    const dados = await baixarExercicio(ano, headers);
    if (!Array.isArray(dados) || !dados.length) throw new Error(`Arquivo de despesas vazio em ${ano}.`);
    await writeFile(join(raw, `betha-execucao-despesas-${ano}.json`), JSON.stringify(dados));
    return [ano, dados];
  }));
  for (const [ano, dados] of lote) arquivos.set(ano, dados);
}
for (let ano = 2025; ano <= anoFinal; ano++) {
  const dados = await baixarExercicio(ano, headers, contratos[0].id, 'ano');
  if (!Array.isArray(dados) || dados.some(registro => registro.nomeEntidade !== 'CAMARA MUNICIPAL DE ARARAS' || registro.ano !== ano)) {
    throw new Error(`Arquivo de contratos inválido para ${ano}.`);
  }
  await writeFile(join(raw, `betha-contratos-${ano}.json`), JSON.stringify(dados));
  console.log(`Contratos de ${ano}: ${dados.length}.`);
}
const pagamentos = calcular(arquivos, fim, new Date().toISOString());
await writeFile(join(resolve(destino), 'pagamentos.js'), `globalThis.ARARAS_PAGAMENTOS = ${JSON.stringify(pagamentos)};\n`);
console.log(`Pagamentos consultados até ${fim}. Último lançamento em ${pagamentos.ultimaData}.`);
