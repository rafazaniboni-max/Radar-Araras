'use strict';

const radarResumo = globalThis.ARARAS_TERRITORIO_RESUMO;
let radarPagamentos = globalThis.ARARAS_PAGAMENTOS;
let consultaPagamentos;
const avisoRepeticao = 'Pedido repetido não prova que a Prefeitura ignorou. Os pedidos podem se referir a trechos diferentes da mesma rua. Leia os registros para conferir.';
const coresGrupos = { melhorias: 'azul', perguntas: 'laranja', homenagens: 'rosa', leis: 'verde', outros: 'neutro' };
const marcasGrupos = { melhorias: '⌖', perguntas: '?', homenagens: '✦', leis: '§', outros: '…' };
const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
let dadosTerritorio;
let relogioSalarios;
const formatoTaxaSalarios = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4, maximumFractionDigits: 4 });

function estimarSalarios(dados, agora = Date.now()) {
  const pago = dados?.totais?.vereadores;
  const inicio = Date.parse(`${dados?.inicio}T00:00:00-03:00`);
  const fim = Date.parse('2029-01-01T00:00:00-03:00');
  const referencia = Math.min(Date.parse(dados?.consultadoEm), fim);
  if (!Number.isSafeInteger(pago) || pago <= 0 || !Number.isFinite(inicio)
      || !Number.isFinite(referencia) || referencia <= inicio || !Number.isFinite(agora)) return null;
  const taxa = pago / ((referencia - inicio) / 1000);
  const segundos = Math.max(0, (Math.min(agora, fim) - referencia) / 1000);
  return { valor: Math.floor(pago + taxa * segundos), taxa };
}

function iniciarContadorSalarios(raiz) {
  clearInterval(relogioSalarios);
  const atualizar = () => {
    if (!raiz.isConnected) {
      clearInterval(relogioSalarios);
      return;
    }
    const contador = raiz.querySelector('[data-contador-salarios]');
    const estimativa = estimarSalarios(radarPagamentos);
    if (!contador || !estimativa) return;
    const valor = moneyFormat.format(estimativa.valor / 100);
    contador.textContent = valor;
    contador.setAttribute('aria-label', `Salários desde a posse, estimativa em tempo real ${valor}`);
  };
  atualizar();
  relogioSalarios = setInterval(atualizar, 1000);
}

function textoLocal(value) {
  let chave = normalize(value).replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/\bav\b/g, 'avenida').replace(/\br\b/g, 'rua')
    .replace(/\bjd\b/g, 'jardim').replace(/\bdoutor(a?)\b/g, 'dr$1')
    .replace(/\bprofessor(a?)\b/g, 'prof$1').replace(/\b0+(?=\d)/g, '')
    .replace(/\b(?:bairro|logradouro) +/, '');
  for (const [variante, canonica] of Object.entries(radarResumo?.aliasVias || {})) {
    chave = ` ${chave} `.replaceAll(` ${variante} `, ` ${canonica} `).trim();
  }
  return chave;
}

function fonteLocal(termo) {
  if (!termo) return proposalsSource;
  const query = new URLSearchParams({Pesquisa:'Textual', Modulo:'8', Documento:'0', NoTexto:'True', Assunto:`"${termo.replaceAll('"', '')}"`});
  return `https://araras.siscam.com.br/Documentos/Pesquisa/74?${query}`;
}

function fontePedido(pedido) {
  return `https://araras.siscam.com.br/Documentos/Documento/${pedido.id}`;
}

function quadroPagamentos(dados = radarPagamentos, projetar = true) {
  const totais = dados?.totais;
  const estimativa = projetar ? estimarSalarios(dados) : null;
  const outrasDespesas = totais && totais.contratos + totais.pessoal + totais.encargos + totais.demais;
  const quadros = [
    ['salarios', 'Salários dos 11 vereadores e suplentes desde a posse', totais?.vereadores,
      'E subindo... Subsídios e vencimentos pagos na legislatura 2025–2028.'],
    ['contratos', 'Contratos e demais despesas desde a posse', outrasDespesas,
      'Inclui salários de concursados, funções de confiança, comissionados e horas extras.'],
    ['viagens', 'Viagens e despesas com hospedagem e alimentação', totais?.viagens,
      'Inclui deslocamentos, estacionamentos e pedágios identificados como despesas de viagem.'],
  ];
  return `<section class="radar-finance" aria-labelledby="radar-titulo-pagamentos">
    <header class="radar-bloco-titulo">
      <p class="radar-chamada">Contadores.</p>
      <h2 id="radar-titulo-pagamentos">Salários, contratos e demais despesas. Os gastos da Câmara Municipal de Araras/SP.</h2>
    </header>
    ${quadros.map(([classe, titulo, valor, detalhe]) => `<article class="radar-finance-quadro radar-finance-${classe}">
      <h3>${titulo}</h3>
      ${classe === 'salarios' && estimativa ? `<span class="radar-contador-rotulo">Estimativa em tempo real</span>
        <div class="radar-finance-valor"><a data-contador-salarios href="${bethaSource}" target="_blank" rel="noopener noreferrer" aria-describedby="salarios-metodo" aria-label="Salários desde a posse, estimativa em tempo real ${moneyFormat.format(estimativa.valor / 100)}">${moneyFormat.format(estimativa.valor / 100)}</a></div>`
        : `<div class="radar-finance-valor">${money(valor, bethaSource, titulo)}</div>`}
      <p>${detalhe}</p>
      ${classe === 'salarios' && estimativa ? `<div class="radar-contador-base"><p id="salarios-metodo">Até o momento o valor efetivo pago é de ${money(valor, bethaSource, 'Salários pagos registrados')}. O contador acima é somente um cálculo estimado em tempo real.</p></div>` : ''}
    </article>`).join('')}
    <div class="radar-finance-rodape">
      ${dados?.ultimaData ? `<p>Último pagamento nos dados em ${official(dateLabel(dados.ultimaData), bethaSource)}.</p>` : ''}
      ${dados?.fim ? `<p>Fonte consultada em ${official(dateLabel(dados.fim), bethaSource)}.</p>` : ''}
      <p class="radar-finance-fontes">${official('Dados abertos da Câmara', bethaSource)} <a href="#contas/despesas">Despesas por mês <span aria-hidden="true">→</span></a></p>
    </div>
  </section>`;
}

async function carregarQuadroPagamentos(raiz) {
  consultaPagamentos ??= fetch('/api/pagamentos', { cache: 'no-store' })
    .then(resposta => resposta.ok && resposta.status !== 204 ? resposta.json() : null)
    .catch(() => null);
  const dados = await consultaPagamentos;
  if (Number.isSafeInteger(dados?.totais?.viagens) && dados.consultadoEm >= (radarPagamentos?.consultadoEm || '')) {
    radarPagamentos = dados;
  }
  const quadro = raiz.querySelector('.radar-finance');
  if (raiz.isConnected && quadro && !quadro.contains(document.activeElement)) {
    quadro.outerHTML = quadroPagamentos();
    iniciarContadorSalarios(raiz);
  }
}

function dashboard() {
  const totals = radarResumo?.porGrupo || {};
  const summary = [
    ['Propostas no período', radarResumo?.total, 'neutro'], ['Pedidos de melhoria', totals.melhorias, 'azul'],
    ['Homenagens', totals.homenagens, 'rosa'], ['Propostas de lei', totals.leis, 'verde']
  ];
  return `<div id="radar">
    <section id="inicio" class="radar-hero" tabindex="-1">
      <div class="radar-abertura">
        <p class="radar-period"><span aria-hidden="true"></span> ${periodLabel(proposalsSource)}</p>
        <h1 class="radar-logo"><img src="logo-radar-araras.png" alt="Radar Araras" width="2137" height="736" decoding="async"></h1>
        <p class="radar-subtitle"><strong>Raio-X da Câmara Municipal de Araras/SP.</strong> Acompanhe, fiscalize e cobre. Saiba o que seus vereadores fazem — e o que deixam de fazer. Informação pública, transparência e cobrança em nome do cidadão.</p>
      </div>
      ${quadroPagamentos(radarPagamentos, false)}
      <section class="radar-resumo" aria-labelledby="radar-titulo-numeros">
        <header class="radar-bloco-titulo">
          <p class="radar-chamada">O que estão fazendo.</p>
          <h2 id="radar-titulo-numeros">A Câmara Municipal em Números</h2>
        </header>
        <div class="radar-totals">${summary.map(([label, total, color]) => `<div class="tom-${color}"><strong>${numeric(total, proposalsSource, label)}</strong><span>${label}</span></div>`).join('')}</div>
      </section>
    </section>
    <section id="bairros" class="radar-section" tabindex="-1" aria-labelledby="titulo-bairros">
      <p class="radar-chamada">Comece por aqui</p>
      <h2 id="titulo-bairros">O que pediram pelo seu bairro?</h2>
      <p class="radar-intro">Digite o bairro ou a rua. Sem nada digitado, você vê a cidade inteira.</p>
      <form id="busca-local" class="radar-search" role="search">
        <label class="sr-only" for="termo-local">Bairro ou rua</label><span class="radar-lupa" aria-hidden="true"></span>
        <input type="search" id="termo-local" placeholder="Digite seu bairro ou sua rua" autocomplete="off" maxlength="130">
        <button type="submit">Buscar</button>
      </form>
      <div id="sugestoes-locais" class="radar-sugestoes" aria-label="Sugestões de busca" hidden></div>
      <div class="radar-chips" aria-label="Bairros mais citados">${(radarResumo?.bairros || []).map(lugar => chipLugar(lugar)).join('')}</div>
      <div id="resultado-local" class="radar-result"><p class="notice" role="status">Carregando os pedidos oficiais…</p></div>
    </section>
    <section id="repetidos" class="radar-section" tabindex="-1" aria-labelledby="titulo-repetidos">
      <p class="radar-chamada">Só aqui</p>
      <h2 id="titulo-repetidos">O problema que não some</h2>
      <p class="radar-intro">Veja quando o mesmo tipo de pedido voltou para a mesma rua. Abra o cartão para consultar os autores, as datas e os documentos.</p>
      <div id="lista-repetidos"></div>
      <p class="radar-nota">${avisoRepeticao}</p>
    </section>
    <section id="propostas" class="radar-section" tabindex="-1" aria-labelledby="titulo-propostas">
      <p class="radar-chamada">O trabalho da Câmara</p>
      <h2 id="titulo-propostas">Homenagem ou trabalho?</h2>
      <p class="radar-intro">São ${numeric(radarResumo?.total, proposalsSource, 'Propostas no período')} propostas até agora. Toque em um grupo para ler cada uma. <a href="#fontes">Veja a regra de classificação</a>.</p>
      ${barraDePropostas(totals, 'Propostas por grupo')}
      <div class="radar-categorias">${Object.entries(proposalGroups).map(([id, [label, desc]]) => `<article class="tom-${coresGrupos[id]}">
        <div class="radar-categoria-topo"><span class="radar-icon" aria-hidden="true">${marcasGrupos[id]}</span><div>
          <strong>${numeric(totals[id], proposalsSource, label)}</strong><h3>${escapeHtml(label)}</h3></div></div><p>${escapeHtml(desc)}</p>
        <button class="radar-link" data-abrir-grupo="${id}" aria-label="Ver todas as propostas do grupo ${escapeHtml(label)}" type="button">Ver todas <span aria-hidden="true">→</span></button></article>`).join('')}</div>
    </section>
    ${home()}
    <dialog id="radar-dialog" aria-labelledby="radar-dialog-titulo"><header><div><h2 id="radar-dialog-titulo"></h2><p id="radar-dialog-meta"></p></div><form method="dialog"><button type="submit" aria-label="Fechar">×</button></form></header><div id="radar-dialog-conteudo"></div></dialog>
  </div>`;
}

function barraDePropostas(totais, rotulo = '') {
  const atributos = rotulo ? `role="img" aria-label="${escapeHtml(rotulo)}"` : 'aria-hidden="true"';
  return `<div class="radar-split" ${atributos}>${Object.keys(proposalGroups).filter(grupo => totais[grupo] > 0)
    .map(grupo => `<i class="tom-${coresGrupos[grupo]}" style="flex-grow:${totais[grupo]}"></i>`).join('')}</div>`;
}

function chipLugar(lugar, ativo = false) {
  return `<button type="button" data-radar-lugar="${escapeHtml(lugar.key)}"${ativo ? ' aria-pressed="true"' : ''}>${escapeHtml(lugar.nome)}</button>`;
}

function contar(lista) {
  const resultado = new Map();
  for (const valor of lista) resultado.set(valor, (resultado.get(valor) || 0) + 1);
  return [...resultado].sort((a, b) => b[1] - a[1] || nameOrder.compare(a[0], b[0]));
}

const rankingsPropostas = {
  projetos: 'Quem mais propôs Projetos de Lei',
  homenagens: 'Quem mais propôs Homenagens',
  ruas: 'Quem mais propôs Nomes de Rua'
};

function propostaNoRanking(proposta, grupo) {
  if (grupo === 'projetos') return /^projeto de lei(?: complementar)?\b/.test(normalize(proposta.titulo));
  if (grupo === 'homenagens') return proposta.grupo === 'homenagens';
  if (grupo !== 'ruas' || proposta.grupo === 'perguntas') return false;
  const assunto = normalize(proposta.assunto).replace(/\s+/g, ' ').trim();
  const ato = /^(?:(?:dispoe sobre|trata d[ae]|propoe|solicita|indica|requer)\s+(?:a\s+)?|passa a\s+)?(?:denomina(?:r|cao)?\b|nomeia\b|da (?:o )?nome\b|da denominacao\b|atribui (?:o )?nome\b|altera (?:a )?denominacao\b|oficializa (?:o )?nome\b)/;
  if (!ato.test(assunto)) return false;
  const via = assunto.search(/\b(?:ruas?|avenidas?|vias? publicas?|logradouros?|travessas?|alamedas?|estradas?|vielas?|rodovias?|calcadao|calcadoes)\b/);
  const outroEspaco = assunto.search(/\b(?:pracas?|parques?|escolas?|creches?|pontes?|rotatorias?|predios?|centro|unidades? de saude|ginasios?|cemiterios?)\b/);
  return via >= 0 && (outroEspaco < 0 || via < outroEspaco);
}

function rankingDeAutores(pedidos, grupo) {
  const unicos = [...new Map(pedidos.filter(p => propostaNoRanking(p, grupo)).map(p => [String(p.id), p])).values()];
  return contar(unicos.flatMap(p => [...new Set(p.autores)]))
    .sort((a,b) => b[1] - a[1] || nameOrder.compare(publicName(peopleById.get(a[0]) || {nome:a[0]}), publicName(peopleById.get(b[0]) || {nome:b[0]})));
}

function registrosDoLocal(indice, consulta, selecionado) {
  const termo = textoLocal(consulta);
  if (!termo) return indice.pedidos;
  const variantes = termo.match(/ [1-5]$/) && !termo.startsWith('rua ') ? [termo, termo.replace(/ [1-5]$/, n => ` ${['','i','ii','iii','iv','v'][Number(n)]}`)] : [termo];
  const exato = selecionado || indice.lugares.find(l => variantes.includes(l.key.split(':')[1]) || variantes.includes(textoLocal(l.nome)));
  return indice.pedidos.filter(pedido => {
    if (exato && (pedido.ruas.includes(exato.key) || pedido.bairros.includes(exato.key))) return true;
    if (exato && (termo === 'centro' || /^rua \d+[a-z]?$/.test(termo))) return false;
    const texto = indice.busca.get(pedido.id);
    return variantes.some(valor => texto.includes(` ${valor} `));
  });
}

function pedidoNoRadar(pedido) {
  const fonte = fontePedido(pedido);
  const categoria = proposalGroups[pedido.grupo]?.[0];
  const autores = pedido.autores.map(id => peopleById.get(id)).filter(Boolean);
  return `<li class="radar-pedido"><span class="radar-icon tom-${coresGrupos[pedido.grupo]}" aria-hidden="true">${marcasGrupos[pedido.grupo]}</span>
    <div><p class="radar-ementa">${escapeHtml(pedido.assunto || pedido.titulo)}</p>
    <p class="radar-pedido-meta"><span class="radar-tipo-pedido tom-${coresGrupos[pedido.grupo]}">${escapeHtml(categoria)}</span> ${official(dateLabel(pedido.data, dataCurta), fonte)} · ${official(pedido.titulo, fonte)}</p>
    <div class="radar-autores">${autores.map(autor => `<a href="${profilePath(autor)}">${avatar(autor)}${escapeHtml(publicName(autor))}</a>`).join('')}</div></div>
    <span class="radar-documento">${official('Abrir na Câmara ↗', fonte)}</span></li>`;
}

function cartaoRepetido(rep, mapa) {
  const novo = mapa.get(rep.pedidos[0]);
  const antigo = mapa.get(rep.pedidos.at(-1));
  const fonte = fonteLocal(rep.rua);
  const autores = new Set(rep.pedidos.flatMap(id => mapa.get(id).autores));
  return `<article class="radar-repeat-card"><div class="radar-repeat-topo">
    <div class="radar-vezes"><strong>${numeric(rep.pedidos.length, fonte, `Pedidos para ${rep.rua}`)}</strong><span>vezes</span></div>
    <div><h3>${escapeHtml(rep.rua)}</h3>${rep.bairro ? `<p>${escapeHtml(rep.bairro)}</p>` : ''}</div></div>
    <p class="radar-repeat-info"><span class="radar-tema">${escapeHtml(rep.tema)}</span> ${numeric(autores.size, fonte, 'Autores dos pedidos')} ${autores.size === 1 ? 'vereador pediu' : 'vereadores pediram'}</p>
    <p class="radar-datas">De ${official(dateLabel(antigo.data, dataCurta), fontePedido(antigo))} a ${official(dateLabel(novo.data, dataCurta), fontePedido(novo))}</p>
    <button type="button" class="radar-link" data-abrir-repetido="${rep.id}${rep.local ? '-local' : ''}">Ver pedidos e cobrar <span aria-hidden="true">→</span></button></article>`;
}

function carregarTerritorio() {
  if (dadosTerritorio) return dadosTerritorio;
  dadosTerritorio = fetch('territorio.json').then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }).then(indice => ({...indice, mapa:new Map(indice.pedidos.map(p => [p.id,p])),
    busca:new Map(indice.pedidos.map(p => [p.id,` ${textoLocal(p.assunto)} `])),
    locais:new Map(indice.lugares.map(l => [l.key,l])), cruzamentos:new Map(indice.repetidos.map(r => [r.id,r]))
  })).catch(error => { dadosTerritorio = null; throw error; });
  return dadosTerritorio;
}

function paginarPedidos(lista, botao, pedidos, passo) {
  const adicionar = () => {
    const inicio = lista.children.length;
    lista.insertAdjacentHTML('beforeend', pedidos.slice(inicio, inicio + passo).map(pedidoNoRadar).join(''));
    botao.hidden = lista.children.length === pedidos.length;
    const restante = pedidos.length - lista.children.length;
    botao.textContent = `Mostrar mais ${Math.min(passo, restante)} de ${numberFormat.format(restante)}`;
    if (inicio) lista.children[inicio]?.querySelector('a')?.focus();
  };
  adicionar();
  botao.onclick = adicionar;
}

async function instalarRadar(raiz, consultaInicial = '') {
  carregarQuadroPagamentos(raiz);
  const busca = raiz.querySelector('#termo-local');
  const formulario = raiz.querySelector('#busca-local');
  const sugestoes = raiz.querySelector('#sugestoes-locais');
  const resultado = raiz.querySelector('#resultado-local');
  const listaRepeticoes = raiz.querySelector('#lista-repetidos');
  const modal = raiz.querySelector('#radar-dialog');
  busca.value = consultaInicial;
  let selecionado = null;
  let indice;
  let boletimLocal = new Map();
  let limiteRepeticoes = 9;
  let digitacao;
  let rankingCompleto = false;
  formulario.addEventListener('submit', event => {
    event.preventDefault();
    clearTimeout(digitacao);
    sugestoes.hidden = true;
    if (indice) recarregarBusca();
  });

  const recarregarBusca = () => {
    const consulta = busca.value.trim();
    const encontrados = registrosDoLocal(indice, consulta, selecionado);
    const rankings = Object.keys(rankingsPropostas).map(grupo => [grupo, rankingDeAutores(encontrados, grupo)]);
    const siteFonte = fonteLocal(consulta);
    const ids = new Set(encontrados.map(p => p.id));
    boletimLocal = new Map();
    if (consulta) {
      const repetidos = indice.repetidos.map(r => ({...r, pedidos:r.pedidos.filter(id => ids.has(id)), local:true}));
      for (const rep of repetidos.filter(r => r.pedidos.length >= 2).sort((a,b) => b.pedidos.length - a.pedidos.length)) boletimLocal.set(rep.id, rep);
    }
    raiz.querySelectorAll('.radar-chips button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.radarLugar === selecionado?.key)));
    resultado.innerHTML = `<div class="radar-contagem" role="status"><strong>${numeric(encontrados.length, siteFonte, 'Propostas encontradas')}</strong><p>${consulta ? `${encontrados.length === 1 ? 'proposta cita' : 'propostas citam'} <b>${escapeHtml(consulta)}</b> até agora` : 'propostas para <b>a cidade inteira</b> até agora'}</p></div>
      ${encontrados.length ? `<div class="radar-breakdown">
        ${rankings.map(([grupo, autores]) => `<section class="radar-ranking" aria-label="${rankingsPropostas[grupo]}"><h3>${rankingsPropostas[grupo]}</h3>
          ${autores.length ? `<ol>${autores.filter(([,total], pos) => rankingCompleto || pos < 5 || total === autores[4]?.[1]).map(([id,total]) => {
            const autor = peopleById.get(id);
            return autor ? `<li><div class="radar-rank"><span>${avatar(autor)}<span><button type="button" class="radar-ranking-nome" data-ranking-grupo="${grupo}" data-ranking-autor="${id}" aria-label="Ver propostas de ${escapeHtml(publicName(autor))}: ${rankingsPropostas[grupo]}">${escapeHtml(publicName(autor))}</button>${autor.partido ? `<small> · ${escapeHtml(autor.partido)}</small>` : ''}</span></span><strong>${numeric(total,proposalIndex(autor)?.fonte || siteFonte,`${rankingsPropostas[grupo]} · ${publicName(autor)}`)}</strong></div><i aria-hidden="true" style="--barra:${Math.round(total/autores[0][1]*100)}%"></i></li>` : '';
          }).join('')}</ol><button type="button" class="radar-link" data-ranking-grupo="${grupo}">Ver todas as propostas <span aria-hidden="true">→</span></button>` : '<p class="radar-nota">Nenhuma proposta deste grupo no recorte da busca.</p>'}
        </section>`).join('')}
      </div>
      <p class="radar-nota">Toque no nome para ler as propostas. ${consulta ? 'Os rankings seguem o bairro ou a rua pesquisados. ' : ''}Cada proposta conta uma vez por autor; coautores recebem a mesma contagem. Mostramos os cinco primeiros e os empatados na última posição. <a href="#fontes">Entenda os critérios</a>.</p>
      ${!rankingCompleto && rankings.some(([,autores])=>autores.length > 5) ? '<button type="button" class="radar-link radar-ranking-completo" data-ranking-completo>Ver ranking completo</button>' : ''}
      ${boletimLocal.size ? `<h3 class="radar-list-titulo">Problemas que voltam aqui</h3><div class="radar-repeat-grid">${[...boletimLocal.values()].slice(0,3).map(r=>cartaoRepetido(r,indice.mapa)).join('')}</div>` : ''}
      <h3 class="radar-list-titulo">${consulta ? 'Os pedidos mais recentes' : 'As propostas mais recentes da cidade'}</h3><ul class="radar-pedidos"></ul><button type="button" class="more radar-more" hidden></button>` : '<p class="notice">Nenhum registro encontrado. Tente outro nome ou uma parte dele.</p>'}`;
    if (encontrados.length) paginarPedidos(resultado.querySelector('.radar-pedidos'), resultado.querySelector('.radar-more'), encontrados, 4);
  };

  const mostrarRepeticoes = () => {
    listaRepeticoes.innerHTML = `<div class="radar-repeat-grid">${indice.repetidos.slice(0,limiteRepeticoes).map(r=>cartaoRepetido(r,indice.mapa)).join('')}</div>
      ${limiteRepeticoes < indice.repetidos.length ? `<button type="button" class="more radar-more" data-mais-repetidos>Mostrar mais ruas (${numberFormat.format(indice.repetidos.length - limiteRepeticoes)} na fila)</button>` : ''}`;
  };

  const mostrarModal = (titulo, fonte, pedidos, subtitulo, recorrencia = false) => {
    modal.querySelector('h2').textContent = titulo;
    modal.querySelector('#radar-dialog-meta').innerHTML = `${numeric(pedidos.length,fonte,'Propostas')} ${escapeHtml(subtitulo)}`;
    const conteudo = modal.querySelector('#radar-dialog-conteudo');
    const contatos = recorrencia ? [...new Set(pedidos.flatMap(pedido => pedido.autores))].map(id => peopleById.get(id)).filter(autor => autor?.perfil) : [];
    conteudo.innerHTML = `${recorrencia ? `<p class="aviso-repeticao">${avisoRepeticao}</p>
      <aside class="radar-contatos"><h3>Cobre uma resposta</h3><p>Consulte os canais oficiais dos gabinetes que fizeram os pedidos.</p>
      <div>${contatos.length ? contatos.map(autor => official(publicName(autor), autor.perfil)).join('') : official('Contatos da Câmara', council)}</div></aside>` : ''}
      <ul class="radar-pedidos"></ul><button type="button" class="more radar-more" hidden></button>`;
    paginarPedidos(conteudo.querySelector('.radar-pedidos'), conteudo.querySelector('.radar-more'), pedidos, 12);
    if (!modal.open) modal.showModal();
    conteudo.scrollTop = 0;
  };

  try {
    indice = await carregarTerritorio();
    if (!raiz.isConnected) return;
  } catch {
    resultado.innerHTML = `<p class="notice" role="status">A busca não carregou. Recarregue a página ou ${official('pesquise no Siscam',proposalsSource)}.</p>`;
    return;
  }
  recarregarBusca();
  mostrarRepeticoes();

  busca.addEventListener('input', () => {
    selecionado = null;
    clearTimeout(digitacao);
    digitacao = setTimeout(() => {
      const termo = textoLocal(busca.value);
      const matches = termo.length >= 3 ? indice.lugares.filter(l => textoLocal(l.nome).includes(termo)).slice(0,6) : [];
      sugestoes.innerHTML = matches.map(lugar => chipLugar(lugar)).join('');
      sugestoes.hidden = !matches.length;
      recarregarBusca();
    }, 160);
  });
  raiz.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.radarLugar) {
      clearTimeout(digitacao);
      selecionado = indice.locais.get(button.dataset.radarLugar);
      busca.value = selecionado.nome;
      sugestoes.hidden = true;
      recarregarBusca();
      busca.focus();
    } else if (button.dataset.rankingGrupo) {
      const grupo = button.dataset.rankingGrupo;
      const autorId = button.dataset.rankingAutor;
      const autor = autorId && peopleById.get(autorId);
      const pedidos = registrosDoLocal(indice, busca.value.trim(), selecionado).filter(p => propostaNoRanking(p, grupo) && (!autorId || p.autores.includes(autorId)));
      mostrarModal(`${rankingsPropostas[grupo]}${autor ? ` · ${publicName(autor)}` : ''}`, autor ? proposalIndex(autor)?.fonte || proposalsSource : fonteLocal(busca.value.trim()), pedidos, 'propostas no recorte da busca');
    } else if (button.hasAttribute('data-ranking-completo')) {
      rankingCompleto = true;
      recarregarBusca();
    } else if (button.dataset.abrirRepetido) {
      const chave = button.dataset.abrirRepetido;
      const rep = chave.endsWith('-local') ? boletimLocal.get(chave.replace('-local','')) : indice.cruzamentos.get(chave);
      mostrarModal(rep.rua, fonteLocal(rep.rua), rep.pedidos.map(id => indice.mapa.get(id)), `pedidos · ${rep.tema}${rep.bairro ? ` · ${rep.bairro}` : ''}`, true);
    } else if (button.dataset.abrirGrupo) {
      const id = button.dataset.abrirGrupo;
      mostrarModal(proposalGroups[id][0], proposalsSource, indice.pedidos.filter(p=>p.grupo === id), 'propostas no período');
    } else if (button.hasAttribute('data-mais-repetidos')) {
      const anterior = limiteRepeticoes;
      limiteRepeticoes += 9;
      mostrarRepeticoes();
      listaRepeticoes.querySelectorAll('.radar-repeat-card button')[anterior]?.focus();
    }
  });
  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest('a[href^="#"]')) modal.close();
  });
}
