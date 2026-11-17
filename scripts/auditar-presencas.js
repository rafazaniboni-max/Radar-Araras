'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projeto = path.resolve(__dirname, '..');
function argumento(nome, padrao) {
  const indice = process.argv.indexOf(nome);
  return indice === -1 ? padrao : path.resolve(process.argv[indice + 1]);
}
const pastaDist = argumento('--dist', path.join(projeto, 'dist'));
const pastaAtas = argumento('--atas', path.resolve(projeto, '../amostras-araras/atas-auditoria'));
const lerAtas = arquivo => JSON.parse(fs.readFileSync(path.join(pastaAtas, arquivo), 'utf8'));
const contexto = {};
vm.runInNewContext(fs.readFileSync(path.join(pastaDist, 'legislativo.js'), 'utf8'), contexto);
const { vereadores, sessoes } = contexto.ARARAS_LEGISLATIVO;
const atas = new Map(lerAtas('downloads.json').map(ata => [ata.id, ata]));
const paginas = lerAtas('primeiras-paginas.json');

const normalizar = valor => String(valor ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().trim().replace(/\s+/g, ' ');
const porId = new Map(vereadores.filter(pessoa => pessoa.id != null).map(pessoa => [String(pessoa.id), pessoa.nome]));
const porNome = new Map(vereadores.map(pessoa => [normalizar(pessoa.nome), pessoa.nome]));
const nomesNaAta = new Map(vereadores.map(pessoa => [pessoa.nome, normalizar(pessoa.nome)
  .replace('f. de lima', '(?:f[.]?|florencio) de lima')
  .replace('corochel', 'corr?ochel')
  .replace('bitencourt', 'bitt?encourt')
  .replace('marcuci', 'marcucc?i')]));
const meses = 'janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro'.split(' ');

const resultados = sessoes.map(sessao => {
  const ata = atas.get(sessao.id);
  const pagina = normalizar(paginas[sessao.id]);
  const cabecalho = pagina.match(/(?<![\w-])presidente\s*:[\s\S]*?vereadores? presentes\s*:[^.]*\./)?.[0];
  const abertura = pagina.slice(0, cabecalho ? pagina.indexOf(cabecalho) : 0);
  const dataPorExtenso = abertura.match(/realizad[ao] em (\d{1,2})[oº°]?(?:\s*\([^)]+\))? de (\w+) de (\d{4})/);
  const mes = meses.indexOf(dataPorExtenso?.[2]);
  const dataAta = mes === -1 ? null : `${dataPorExtenso[3]}-${String(mes + 1).padStart(2, '0')}-${dataPorExtenso[1].padStart(2, '0')}`;
  const daAta = cabecalho ? [...nomesNaAta].filter(([, padrao]) => new RegExp(`\\b${padrao}\\b`).test(cabecalho))
    .map(([nome]) => nome).sort() : null;
  const nomesSemIdentificacao = cabecalho ? cabecalho
    .replace(/(?:vice-)?presidente\s*:|secretari[oa]?(?: em exercicio)?\s*:|vereadores? presentes\s*:/g, '')
    .replace(new RegExp([...nomesNaAta.values()].map(padrao => `\\b${padrao}\\b`).join('|'), 'g'), '')
    .replace(/[\s.,:;–-]|\be\b/g, '').trim() : null;
  const presencas = sessao.chamadas.flatMap(chamada => chamada.registros)
    .filter(registro => ['presente', 'presentes'].includes(normalizar(registro.situacao)));
  const identificados = presencas.map(registro => porId.get(String(registro.id)) || porNome.get(normalizar(registro.nome)));
  if (identificados.some(nome => !nome)) throw new Error(`Presença sem perfil identificado na sessão ${sessao.id}`);
  const doPainel = [...new Set(identificados)].sort();
  const soAta = daAta?.filter(nome => !doPainel.includes(nome));
  const soPainel = daAta ? doPainel.filter(nome => !daAta.includes(nome)) : null;
  let status = 'coincidiu';
  if (!ata?.pdf) status = 'sem_ata';
  else if (!cabecalho || nomesSemIdentificacao || !dataAta) status = 'ata_ambigua';
  else if (dataAta !== sessao.data) status = 'data_diferente';
  else if (!sessao.chamadas.length) status = 'sem_chamada';
  else if (soAta.length || soPainel.length) status = 'diferenca';
  return { id: sessao.id, titulo: sessao.titulo, data: sessao.data, dataAta, url: sessao.url, pdf: ata?.pdf,
    status, doPainel, daAta, soPainel, soAta, nomesSemIdentificacao, cabecalho };
});

const comparaveis = resultados.filter(r => ['coincidiu', 'diferenca'].includes(r.status));
const porPessoa = vereadores.map(({ nome }) => ({
  nome,
  painelTodas: resultados.filter(r => r.doPainel.includes(nome)).length,
  painelComparaveis: comparaveis.filter(r => r.doPainel.includes(nome)).length,
  atasComparaveis: comparaveis.filter(r => r.daAta.includes(nome)).length,
}));

if (process.argv.includes('--site')) {
  const resumo = { recorte: contexto.ARARAS_LEGISLATIVO.fim, totais: {}, sessoes: {} };
  for (const { id, status, pdf, daAta, dataAta } of resultados) {
    resumo.totais[status] = (resumo.totais[status] ?? 0) + 1;
    if (!pdf) continue;
    resumo.sessoes[id] = { pdf, status };
    if (status === 'sem_chamada') resumo.sessoes[id].presentes = daAta;
    if (status === 'data_diferente') resumo.sessoes[id].data = dataAta;
  }
  fs.writeFileSync(path.join(pastaDist, 'auditoria-presencas.js'),
    `globalThis.ARARAS_AUDITORIA_PRESENCAS = ${JSON.stringify(resumo)};\n`);
} else if (process.argv.includes('--anexo')) {
  const rotulos = { coincidiu: 'Mesmos nomes', diferenca: 'Nomes diferentes', data_diferente: 'Data diferente',
    sem_chamada: 'Sem chamada', sem_ata: 'Sem PDF da ata', ata_ambigua: 'Ata ambígua' };
  const linhas = [
    '# Conferência de presença por sessão', '',
    'A data e o nome da sessão são os da ficha oficial. As contagens consideram os presentes na chamada eletrônica e na abertura da ata. Um traço indica fonte indisponível.', '',
    '| Data | Sessão | Chamada | Ata | Conferência |', '| --- | --- | ---: | ---: | --- |',
  ];
  for (const r of resultados) {
    const data = r.data.split('-').reverse().join('/');
    const chamada = r.status === 'sem_chamada' ? '—' : `[${r.doPainel.length}](${r.url})`;
    const ata = r.daAta ? `[${r.daAta.length}](${r.pdf})` : '—';
    linhas.push(`| ${data} | [${r.titulo}](${r.url}) | ${chamada} | ${ata} | ${rotulos[r.status]} |`);
  }
  linhas.push('', '[Voltar ao relatório](auditoria-dados.md)', '');
  fs.writeFileSync(path.join(projeto, 'auditoria-sessoes.md'), linhas.join('\n'));
} else {
  process.stdout.write(JSON.stringify({ resultados, porPessoa }, null, 2) + '\n');
}
