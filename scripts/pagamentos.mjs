const inicio = '2025-01-01';
const fimLegislatura = '2028-12-31';
const grupos = ['vereadores', 'contratos', 'pessoal', 'encargos', 'demais', 'viagens'];
const portal = 'https://transparencia.betha.cloud';
const consulta = 'https://dados.transparencia.betha.cloud/transparencia/dados-abertos/api/consulta/392446';
const autorizacao = 'https://plataforma-oauth.betha.cloud/auth/oauth2/authorize?response_type=token'
  + '&client_id=91a97459-f1d8-4b29-b5fa-2e51d1692623'
  + `&redirect_uri=${portal}/auth-callback.html&scope=transparencia.public&access_mode=anonymous`;
const rubricasComplementares = new Set(['31901142000000', '31901143000000', '31901145000000']);

// Consome também o corpo dentro do prazo. Um download interrompido é repetido por inteiro.
async function lerRespostaOficial(url, options = {}, contexto = 'Consulta oficial', config = {}) {
  const { timeout = 60000, tentativas = 3, pausaMs = 2000,
    fetchImpl = fetch, esperar = ms => new Promise(resolve => setTimeout(resolve, ms)) } = config;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const resposta = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeout) });
      if ([408, 429, 500, 502, 503, 504].includes(resposta.status)) {
        await resposta.body?.cancel();
        const erro = new Error(`HTTP ${resposta.status}`);
        erro.transitorio = true;
        throw erro;
      }
      return { status: resposta.status, headers: resposta.headers, texto: await resposta.text() };
    } catch (erro) {
      const transitorio = erro.transitorio || erro instanceof TypeError || ['TimeoutError', 'AbortError'].includes(erro.name);
      if (!transitorio || tentativa === tentativas) {
        // Não inclui URLs assinadas, cabeçalhos ou tokens no relatório público.
        throw new Error(`${contexto}: falha ${transitorio ? 'temporária de rede ou da fonte' : 'na leitura da resposta'} após ${tentativa} tentativa(s).`);
      }
      console.warn(`${contexto}: resposta temporariamente indisponível; tentativa ${tentativa + 1}/${tentativas}.`);
      await esperar(pausaMs * tentativa);
    }
  }
}

function diaEmAraras(agora) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(agora);
}

function normalizarDescricao(valor = '') {
  return valor.normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase().replace(/\s+/g, ' ');
}

function despesaDeViagem(codigo, historico, rubrica) {
  if (/^3390(?:14|33)/.test(codigo)) return true;
  // Hospedagem de sistemas e vale-transporte pertencem às despesas de funcionamento.
  if (codigo.startsWith('339040') || /\b(?:vale[- ](?:transporte|alimentacao)|estacionamento institucional)\b/.test(historico)) return false;

  const texto = `${rubrica} ${historico}`;
  if (/\b(?:viage(?:m|ns)|pedagios?|taxi|uber|passage(?:m|ns) (?:aereas?|rodoviarias?|ferroviarias?)|transp(?:\.|orte) aereo)\b/.test(texto)) return true;
  if (/\b(?:hospedage(?:m|ns)|hotel|hoteis|pousada|pernoite)\b/.test(texto)
      && !/\bhospedage(?:m|ns) (?:d[eoas] )?(?:sites?|portais?|sistemas?|servidor(?:es)?|dominios?|nuvem)\b/.test(texto)) return true;
  if (/\b(?:tarifas?|taxas?|reembolso|servico|despesas|despesa|ticket) (?:d[eoa] |com )?estacionamento\b/.test(texto)) return true;

  const adiantamento = /\b(?:adiantamento|reembolso)\b/.test(historico);
  const regimeDeViagem = /\bresolu(?:cao|o)\s*(?:n[.oº]?\s*)?0?2\s*\/\s*2024\b/.test(historico);
  const refeicaoNoDestino = /\b(?:alimentacao|refeicoes?|transporte)\b.{0,70}\b(?:em brasilia\/?df|fora do municipio)\b/.test(historico);
  return adiantamento && (regimeDeViagem || refeicaoNoDestino) && !/\b(?:despesas miudas|pronto pagamento)\b/.test(historico);
}

function categoria(registro) {
  const codigo = registro.mascaraElemento;
  const historico = normalizarDescricao(registro.historicoEmpenho || '');
  const mandato = /\bvereador(?:a|es|as)?\b|\bver\.(?=\s)|\bjose roberto rimerio\b/.test(historico);
  if (codigo === '31901175000000' || (rubricasComplementares.has(codigo) && mandato)) return 'vereadores';
  if (/^319(?:003|013|113)/.test(codigo)) return 'encargos';
  if (registro.grupoElemento === 'Pessoal E Encargos Sociais') return 'pessoal';
  if (despesaDeViagem(codigo, historico, normalizarDescricao(registro.descricaoElemento || ''))) return 'viagens';
  const vinculo = String(registro.contrato?.numero ?? '').trim();
  if ((vinculo && vinculo !== '0') || /\bcontrato\s+(?:administrativo\s+)?(?:n[º°o.]?\s*)?\d+\s*\/\s*\d{4}\b/.test(historico)) return 'contratos';
  return 'demais';
}

function centavos(valor) {
  const inteiro = Math.round(valor * 100);
  if (typeof valor !== 'number' || !Number.isSafeInteger(inteiro) || inteiro < 0 || Math.abs(inteiro / 100 - valor) > 1e-8) {
    throw new Error('O portal retornou um valor pago inválido.');
  }
  return inteiro;
}

function calcular(arquivos, fim, consultadoEm) {
  const porAno = {};
  let ultimaData = null;
  let semValor = 0;
  const empenhosConferidos = {};
  const semValorDetalhes = [];
  for (let ano = 2025; ano <= Number(fim.slice(0, 4)); ano++) {
    porAno[ano] = Object.fromEntries(grupos.map(grupo => [grupo, 0]));
  }
  for (const [ano, registros] of arquivos) {
    if (!Array.isArray(registros) || !registros.length) throw new Error(`Exportação vazia para ${ano}.`);
    const empenhos = new Set();
    for (const registro of registros) {
      const numero = registro.numeroEmpenho;
      if (registro.nomeEntidade?.trim() !== 'CAMARA MUNICIPAL DE ARARAS' || registro.anoExercicio !== ano
          || registro.anoCadastro !== ano || numero == null || empenhos.has(numero)) {
        throw new Error(`Registro inesperado na exportação de ${ano}.`);
      }
      empenhos.add(numero);
      const pagamentos = registro.pagamentos ?? [];
      if (ano < 2025 && !pagamentos.some(p => p.dataPagamento >= inicio && p.dataPagamento <= fim)) continue;
      if (typeof registro.mascaraElemento !== 'string') throw new Error(`Empenho sem rubrica ${numero}/${ano}.`);
      for (const data of [registro.dataEmpenho, ...pagamentos.map(p => p.dataPagamento)]) {
        if (data && (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > fim)) {
          throw new Error(`Data fora do recorte no empenho ${numero}/${ano}.`);
        }
      }
      for (const { dataPagamento } of pagamentos) {
        if (dataPagamento && (!ultimaData || dataPagamento > ultimaData)) ultimaData = dataPagamento;
      }
      const identificador = `${numero}/${ano}`;
      const grupo = categoria(registro);
      empenhosConferidos[identificador] = { ano, dataEmpenho: registro.dataEmpenho,
        grupo, valorPagoCentavos: null, pagoNoRecorteCentavos: null, parcelasDivulgadas: pagamentos.length };
      if (registro.valorPagoEmpenho == null) {
        if (pagamentos.length || centavos(registro.valorPagoRestosEmpenho ?? 0) > 0) {
          throw new Error(`Há pagamento informado, mas falta o valor pago consolidado no empenho ${identificador}.`);
        }
        semValor++;
        semValorDetalhes.push({ empenho: identificador, dataEmpenho: registro.dataEmpenho, parcelasDivulgadas: 0 });
        continue;
      }
      const pago = centavos(registro.valorPagoEmpenho);
      empenhosConferidos[identificador].valorPagoCentavos = pago;
      empenhosConferidos[identificador].pagoNoRecorteCentavos = 0;
      const restos = centavos(registro.valorPagoRestosEmpenho ?? 0);
      if (restos > pago) throw new Error(`Restos acima do total no empenho ${numero}/${ano}.`);
      if (porAno[ano]) {
        porAno[ano][grupo] += pago - restos;
        empenhosConferidos[identificador].pagoNoRecorteCentavos += pago - restos;
      }
      if (!restos) continue;
      const porAnoDosRestos = new Map();
      for (const parcela of pagamentos) {
        const anoPago = Number(parcela.dataPagamento?.slice(0, 4));
        if (anoPago > ano) {
          porAnoDosRestos.set(anoPago, (porAnoDosRestos.get(anoPago) ?? 0) + centavos(parcela.valorPagamento));
        }
      }
      const totalParcelas = [...porAnoDosRestos.values()].reduce((soma, valor) => soma + valor, 0);
      if (totalParcelas === restos) {
        for (const [anoPago, valor] of porAnoDosRestos) {
          if (porAno[anoPago]) {
            porAno[anoPago][grupo] += valor;
            empenhosConferidos[identificador].pagoNoRecorteCentavos += valor;
          }
        }
      } else if (porAnoDosRestos.size === 1 && totalParcelas > restos) {
        // Todas as parcelas apontam para o mesmo ano. O consolidado evita repetir lançamentos retificados.
        const anoPago = porAnoDosRestos.keys().next().value;
        if (porAno[anoPago]) {
          porAno[anoPago][grupo] += restos;
          empenhosConferidos[identificador].pagoNoRecorteCentavos += restos;
        }
      } else {
        throw new Error(`Datas dos restos pagos sem confirmação para ${numero}/${ano}.`);
      }
    }
  }
  const totais = Object.fromEntries(grupos.map(grupo => [grupo, Object.values(porAno).reduce((soma, ano) => soma + ano[grupo], 0)]));
  return { inicio, fim, ultimaData, consultadoEm, totais, porAno, semValor,
    conferenciaVersao: 1, empenhosConferidos, semValorDetalhes };
}

async function sessaoPublicaBetha() {
  const resposta = await lerRespostaOficial(autorizacao, { redirect: 'manual' }, 'Acesso público da Betha', {timeout:30000});
  const destino = new URL(resposta.headers.get('location') || portal);
  const token = new URLSearchParams(destino.hash.slice(1)).get('access_token');
  if (resposta.status !== 303 || destino.origin !== portal || destino.pathname !== '/auth-callback.html' || !token) {
    throw new Error('O acesso público da Betha está indisponível.');
  }
  return { Authorization: `Bearer ${token}`, 'App-Context': btoa(JSON.stringify({ portal: '3EqrsBn0TZZ9CBAkiNBwSw==' })),
    Origin: portal, 'Content-Type': 'application/json' };
}

async function baixarExercicio(ano, headers, consultaId = '392446', parametroAno = 'anoExercicio') {
  const endereco = consulta.replace(/\d+$/, String(consultaId));
  const post = { method: 'POST', headers, body: JSON.stringify({ [parametroAno]: [String(ano)] }), redirect: 'manual' };
  const contexto = `Exportação Betha ${consultaId}, exercício ${ano}`;
  let resposta = await lerRespostaOficial(`${endereco}?formato=JSON`, post, contexto);
  for (let tentativa = 0; tentativa < 24 && [202, 204, 409].includes(resposta.status); tentativa++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    resposta = await lerRespostaOficial(`${endereco}/status?formato=JSON`, post, contexto, {timeout:30000});
  }
  if (resposta.status !== 200) throw new Error(`A Betha não liberou a exportação de ${ano} (HTTP ${resposta.status}).`);
  const link = resposta.texto.trim();
  const url = new URL((link.startsWith('"') ? JSON.parse(link) : link).replace(/^http:/, 'https:'));
  if (url.origin !== 'https://s3.sa-east-1.amazonaws.com' || url.username || url.password) {
    throw new Error('A Betha retornou um endereço de arquivo inesperado.');
  }
  const arquivo = await lerRespostaOficial(url, { redirect: 'manual' }, `Download Betha ${consultaId}, exercício ${ano}`, {timeout:90000});
  if (arquivo.status !== 200) throw new Error(`Falha ao baixar o arquivo de ${ano} (HTTP ${arquivo.status}).`);
  return JSON.parse(arquivo.texto);
}

async function consultarPagamentos(agora = new Date()) {
  const dia = diaEmAraras(agora);
  const fim = dia <= fimLegislatura ? dia : fimLegislatura;
  const headers = await sessaoPublicaBetha();
  const filtro = await lerRespostaOficial('https://api.transparencia.betha.cloud/transparencia/api/busca-textual/392446/filtro/anoExercicio/MAX?allConfigs=true&limit=25',
    { headers }, 'Lista oficial de exercícios');
  if (filtro.status !== 200) throw new Error('A lista oficial de exercícios está indisponível.');
  const tabela = JSON.parse(filtro.texto);
  const anoFinal = Number(fim.slice(0, 4));
  const anos = [...new Set(tabela.buckets.map(item => Number(item.description)))]
    .filter(ano => Number.isInteger(ano) && ano <= anoFinal).sort((a, b) => a - b);
  if (![2024, 2025, 2026].every(ano => anos.includes(ano))) throw new Error('A lista oficial está incompleta.');
  const arquivos = new Map();
  for (let i = 0; i < anos.length; i += 2) {
    const lote = await Promise.all(anos.slice(i, i + 2).map(async ano => [ano, await baixarExercicio(ano, headers)]));
    for (const [ano, dados] of lote) arquivos.set(ano, dados);
  }
  return calcular(arquivos, fim, agora.toISOString());
}

export { calcular, consultarPagamentos, diaEmAraras, sessaoPublicaBetha, baixarExercicio, lerRespostaOficial };
