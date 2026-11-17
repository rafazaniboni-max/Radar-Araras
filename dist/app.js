'use strict';

const legislative = globalThis.ARARAS_LEGISLATIVO;
const attendanceAudit = globalThis.ARARAS_AUDITORIA_PRESENCAS;
const finances = globalThis.ARARAS_FINANCAS;
const proposals = globalThis.ARARAS_PROPOSTAS;
const council = 'https://www.araras.sp.leg.br/';
const rosterSource = legislative?.fontes.vereadores || 'https://araras.siscam.com.br/vereadores';
const sessionSource = legislative?.fontes.sessoesConsulta || 'https://araras.siscam.com.br/sessoes';
const proposalsSource = 'https://araras.siscam.com.br/index/74/8';
const financeSource = 'https://transparencia.tce.sp.gov.br/apis';
const bethaSource = 'https://transparencia.betha.cloud/#/3EqrsBn0TZZ9CBAkiNBwSw==/dados-abertos';
const numberFormat = new Intl.NumberFormat('pt-BR');
const moneyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('pt-BR', { year: 'numeric', month: 'long', timeZone: 'UTC' });
const nameOrder = new Intl.Collator('pt-BR', { sensitivity: 'base' });
const panel = document.querySelector('#painel');

const proposalGroups = proposals?.grupos || {};
// Nomes públicos e retratos exibidos na página inicial da Câmara Municipal.
const publicProfiles = {
  4067: ['Ana Júlia Casagrande', '1742328425158_cropped.jpg'],
  4591: ['Dr. Donizeti', '1742328520926_cropped.jpg'],
  4623: ['Fábio Domingues', '1742328543068_cropped.jpg'],
  4624: ['Brambilla', '1742328563988_cropped.jpg'],
  4625: ['Lúcio Casa Bela', '1742328580359_cropped.jpg'],
  4068: ['Missionária Maria', '1793022440981_cropped.png'],
  191: ['Bonezinho Corrochel', '1742328593560_cropped.jpg'],
  4626: ['Marluce Lima', '1742328613391_cropped.jpg'],
  3912: ['Mirian Vanessa', '1742328503635_cropped.jpg'],
  3833: ['Rodrigo Soares', '1742328446681_cropped.jpg'],
  4627: ['Rosa Scanavini', 'Rosa Scanavini.png']
};
const tiposVoto = new Map([['a favor', 'sim'], ['favoravel', 'sim'], ['sim', 'sim'], ['contra', 'nao'],
  ['contrario', 'nao'], ['nao', 'nao'], ['abstencao', 'abstencao']]);
const pesoChamada = new Map([['presente', 3], ['presentes', 3], ['ausencias justificadas', 2], ['ausencia justificada', 2], ['ausente', 1]]);
const percentualPresenca = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });
const sessions = [...(legislative?.sessoes || [])].sort((a, b) => b.data.localeCompare(a.data) || Number(b.id) - Number(a.id));
const people = [...(legislative?.vereadores || [])].sort((a, b) => nameOrder.compare(publicName(a), publicName(b)));
const peopleById = new Map(people.filter(person => person.id != null).map(person => [String(person.id), person]));
const peopleByName = new Map(people.map(person => [normalize(person.nome), person]));
const peopleByRoute = new Map(people.map(person => [personKey(person), person]));
const activityByPerson = new Map(people.map(person => [personKey(person), { attendance: [], votes: [] }]));

for (const session of sessions) {
  for (const call of session.chamadas || []) {
    for (const record of call.registros) {
      const member = findPerson(record);
      if (member) activityByPerson.get(personKey(member)).attendance.push({ session, call, status: record.situacao });
    }
  }
  for (const vote of session.votacoes || []) {
    for (const record of vote.votos || []) {
      const member = findPerson(record);
      if (member) activityByPerson.get(personKey(member)).votes.push({ session, vote, status: record.situacao });
    }
  }
}

const resumoPorPessoa = new Map([...activityByPerson].map(([chave, registros]) => [chave, resumirAtividade(registros)]));

function resumirAtividade(registros) {
  const chamadas = new Map();
  for (const { session, status } of registros.attendance) {
    const peso = pesoChamada.get(normalize(status));
    if (peso && peso > (chamadas.get(session.id) || 0)) chamadas.set(session.id, peso);
  }
  const presenca = { total: chamadas.size, presente: 0, justificada: 0, ausente: 0 };
  for (const peso of chamadas.values()) presenca[['ausente', 'justificada', 'presente'][peso - 1]]++;
  const votos = { sim: 0, nao: 0, abstencao: 0 };
  for (const registro of registros.votes) {
    const tipo = tipoDeVoto(registro);
    if (tipo) votos[tipo]++;
  }
  return { presenca, votos, votosPublicados: registros.votes.length > 0 };
}

function tipoDeVoto({ vote, status }) {
  return !secret(vote) ? tiposVoto.get(normalize(status)) : undefined;
}

function votacoesComVotosIguais() {
  let total = 0;
  let iguais = 0;
  for (const session of sessions) {
    for (const vote of session.votacoes || []) {
      if (normalize(vote.tipo) !== 'nominal' || secret(vote)) continue;
      const votos = (vote.votos || []).map(record => tiposVoto.get(normalize(record.situacao))).filter(Boolean);
      if (votos.length < 2) continue;
      total++;
      if (votos.every(tipo => tipo === votos[0])) iguais++;
    }
  }
  return { total, iguais };
}

function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function normalize(value = '') {
  return String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
}

function findPerson(record) {
  return peopleById.get(String(record.id)) || peopleByName.get(normalize(record.nome));
}

function personKey(person) {
  return encodeURIComponent(person.id ?? `nome-${normalize(person.nome)}`);
}

function officialUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return '';
    if (['araras.siscam.com.br', 'araras.sp.leg.br', 'www.araras.sp.leg.br', 'www.camara-araras.sp.gov.br', 'transparencia.tce.sp.gov.br', 'transparencia.betha.cloud', 'pncp.gov.br'].includes(parsed.hostname)) {
      return parsed.href;
    }
  } catch {
    return '';
  }
  return '';
}

function official(text, url, label) {
  const href = officialUrl(url);
  if (!href) return escapeHtml(text);
  const title = label ? ` aria-label="${escapeHtml(label)}, fonte oficial"` : '';
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener"${title}>${escapeHtml(text)}</a>`;
}

function numeric(value, url, name, format = numberFormat) {
  if (!Number.isFinite(value)) return '<span class="muted" aria-label="Sem registro disponível">—</span>';
  const text = format.format(value);
  return official(text, url, `${name} ${text}`);
}

function dateLabel(value, format = dateFormat) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? '' : format.format(date);
}

function periodLabel(source, start = legislative?.inicio || proposals?.inicio, end = legislative?.fim || proposals?.fim) {
  return start && end ? `${official(dateLabel(start), source)} a ${official(dateLabel(end), source)}` : '';
}

function displayName(name = '') {
  if (name !== name.toLocaleUpperCase('pt-BR')) return name;
  return name.toLocaleLowerCase('pt-BR').split(' ').map((word, index) => {
    if (index && /^(da|das|de|do|dos|e)$/.test(word)) return word;
    return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1);
  }).join(' ');
}

function publicName(person) {
  return publicProfiles[person.id]?.[0] || displayName(person.nome);
}

function avatar(person) {
  const words = publicName(person).trim().split(/\s+/);
  const initials = words[0].charAt(0) + (words.length > 1 ? words.at(-1).charAt(0) : '');
  const photo = publicProfiles[person.id]?.[1];
  const image = officialUrl(photo ? `${council}Arquivos/Vereadores/${encodeURIComponent(photo)}` : person.foto);
  return `<span class="avatar" aria-hidden="true"><span>${escapeHtml(initials.toUpperCase())}</span>${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</span>`;
}

function profilePath(person, view = '') {
  return `#vereador/${personKey(person)}${view ? `/${view}` : ''}`;
}

function status(text) {
  return `<span class="badge">${escapeHtml(text)}</span>`;
}

function intro(title, copy = '') {
  return `<header class="page-intro"><h1>${escapeHtml(title)}</h1>${copy ? `<p>${escapeHtml(copy)}</p>` : ''}</header>`;
}

function back(path, title) {
  return `<a class="back" href="${path}"><span aria-hidden="true">←</span> ${escapeHtml(title)}</a>`;
}

function switcher(items, path, current, name) {
  return `<nav class="switcher" aria-label="${escapeHtml(name)}">${items.map(([slug, label]) =>
    `<a href="${path}/${slug}"${current === slug ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`).join('')}</nav>`;
}

function entries(rows, emptyText) {
  if (!rows.length) return `<p class="notice">${escapeHtml(emptyText)}</p>`;
  return `<ul class="entry-list" data-list>${rows.map((row, index) => `<li class="entry${row.className ? ` ${row.className}` : ''}"${index >= 15 ? ' hidden' : ''}>${row.html}</li>`).join('')}</ul>${rows.length > 15 ? '<button class="more" type="button" data-more>Mostrar mais</button>' : ''}`;
}

function metric(title, value, source) {
  return `<div><dt>${escapeHtml(title)}</dt><dd${value == null ? ' class="missing"' : ''}>${numeric(value, source, title)}</dd></div>`;
}

function proposalIndex(person) {
  return proposals?.perfis[person.id];
}

function presencaNoCartao({ total, presente, justificada, ausente }) {
  if (!total) return '<p class="section-note">Sem presença registrada nas chamadas consultadas.</p>';
  const proporcao = presente / total;
  return `<div class="radar-presenca">
    <div class="radar-anel" style="--presenca:${proporcao * 100}%;--justificada:${(presente + justificada) / total * 100}%">
      ${numeric(proporcao, sessionSource, 'Presença nas sessões com chamada', percentualPresenca)}</div>
    <div><p><strong>${numeric(presente, sessionSource, 'Presenças')} de ${numeric(total, sessionSource, 'Sessões com registro para o vereador')}</strong> sessões até agora</p>
    <p>${numeric(justificada, sessionSource, 'Ausências justificadas')} ${justificada === 1 ? 'ausência justificada' : 'ausências justificadas'} · ${numeric(ausente, sessionSource, 'Ausências registradas')} ${ausente === 1 ? 'ausência' : 'ausências'}</p></div>
  </div>`;
}

function personCard(person) {
  const { presenca, votos, votosPublicados } = resumoPorPessoa.get(personKey(person));
  const totalVotos = votos.sim + votos.nao + votos.abstencao;
  const votosNaoSim = votos.nao + votos.abstencao;
  const name = publicName(person);
  const nomeCompleto = displayName(person.nome);
  const proposalData = proposalIndex(person);
  const cartao = normalize(person.partido).replace(/[^a-z0-9]+/g, '');
  return `<article class="person-card" data-partido="${cartao}">
    <div class="radar-cracha-topo">
      <div class="person-info">${avatar(person)}<div><h3><a href="${profilePath(person)}">${escapeHtml(name)}</a></h3>${name !== nomeCompleto ? `<p>${escapeHtml(nomeCompleto)}</p>` : ''}</div></div>
      <span class="radar-partido">${person.partido ? official(person.partido, person.perfil) : 'Partido sem registro'}</span>
    </div>
    <div class="radar-cracha-corpo">
      ${presencaNoCartao(presenca)}
      <dl class="metrics radar-cracha-metricas">
        ${metric(proposalData?.completo === false ? 'Propostas encontradas' : 'Propostas no período', proposalData?.total, proposalData?.fonte)}
        ${metric('Votos divulgados', votosPublicados ? totalVotos : null, sessionSource)}
      </dl>
      <div class="person-card-groups"><h4>O que propôs até agora</h4>
        ${proposalData ? `${barraDePropostas(proposalData.grupos)}<ul>${Object.entries(proposalGroups).map(([grupo,[titulo]]) => `<li class="tom-${coresGrupos[grupo]}"><a href="${profilePath(person,'propostas')}/${grupo}">${escapeHtml(titulo)}</a>${numeric(proposalData.grupos[grupo],proposalData.fonte,titulo)}<span aria-hidden="true">›</span></li>`).join('')}</ul>` : '<p class="section-note">Propostas sem registro disponível.</p>'}
      </div>
      <div class="radar-votos-cartao"><h4>Como votou até agora</h4>
        <dl class="radar-votos">${metric('vezes sim', votosPublicados ? votos.sim : null, sessionSource)}${metric(votos.abstencao ? 'não ou abstenção' : 'vezes não', votosPublicados ? votosNaoSim : null, sessionSource)}</dl>
        ${votosNaoSim ? `<a href="${profilePath(person, 'votos')}/nao-sim">Ver quando não votou sim <span aria-hidden="true">→</span></a>` : ''}
      </div>
      <div class="radar-cracha-links"><a href="${profilePath(person)}" aria-label="Ver atividade de ${escapeHtml(name)}">Ver atividade <span aria-hidden="true">→</span></a>
        ${person.perfil ? official('Ficha oficial na Câmara ↗', person.perfil) : ''}</div>
    </div>
  </article>`;
}

function home() {
  const current = people.filter(person => person.emExercicio);
  const former = people.filter(person => !person.emExercicio);
  const partidos = [...new Set(people.map(person => person.partido).filter(Boolean))].sort(nameOrder.compare);
  const { total, iguais } = votacoesComVotosIguais();
  const chamadaVotos = total ? `Até agora, os votos registrados foram iguais em ${numeric(iguais, sessionSource, 'Votações com votos iguais')} de ${numeric(total, sessionSource, 'Votações nominais consideradas')} votações nominais. ` : '';
  return `<section id="vereadores" class="radar-section" tabindex="-1" aria-labelledby="titulo-vereadores">
  <p class="radar-chamada">Um por um</p>
  <h2 id="titulo-vereadores">Os ${numeric(current.length, rosterSource, 'Vereadores em exercício')} vereadores</h2>
  <p class="radar-intro">${chamadaVotos}Toque nos números do crachá para ver os detalhes. <a href="#sessoes">Consultar sessões</a>.</p>
  <div class="radar-filtros">
    <label>Buscar por nome<input type="search" id="busca" placeholder="Ex.: Ana Júlia, Rosa" autocomplete="off"></label>
    <label>Partido<select id="filtro-partido"><option value="">Todos</option>${partidos.map(partido => `<option>${escapeHtml(partido)}</option>`).join('')}</select></label>
    <label>Ordenar por<select id="ordem-vereadores"><option value="nome">Nome (A–Z)</option><option value="ausencias">Mais ausências registradas</option><option value="leis">Mais propostas de lei</option><option value="homenagens">Mais homenagens</option><option value="melhorias">Mais pedidos para os bairros</option><option value="nao">Quem mais votou “não”</option></select></label>
  </div>
  <p class="section-note radar-conta-vereadores" id="conta-vereadores" role="status">Mostrando os ${numeric(current.length, rosterSource, 'Vereadores em exercício')} vereadores.</p>
  <div class="councillors" id="em-exercicio">${current.map(personCard).join('')}</div>
  ${former.length ? `<section class="former" id="outros"><h2>Também atuaram no período</h2><p class="section-note">Parlamentares com registros nas sessões consultadas.</p><div class="councillors" id="fora-exercicio">${former.map(personCard).join('')}</div></section>` : ''}
  <p class="notice" id="sem-resultados" role="status" hidden>Nenhum nome ou partido encontrado.</p></section>`;
}

function personPage(person, selected, group) {
  if (!person) return intro('Vereador não localizado') + back('#vereadores', 'Voltar aos vereadores');
  const view = ['presenca', 'propostas', 'votos'].includes(selected) ? selected : 'presenca';
  const name = publicName(person);
  const fullName = displayName(person.nome);
  const activity = activityByPerson.get(personKey(person));
  const officialProfile = person.perfil ? official('Perfil na Câmara', person.perfil) : '';
  const content = view === 'propostas' ? personProposals(person, group) : view === 'votos' ? personVotes(activity, person, group) : personAttendance(activity);
  return `${back('#vereadores', 'Todos os vereadores')}
    <header class="profile-head"><div class="profile-identity">${avatar(person)}<div><h1>${escapeHtml(name)}</h1><p class="role-line">${[fullName !== name && escapeHtml(fullName), person.partido && official(person.partido, person.perfil), person.emExercicio ? 'Em exercício' : 'Com registros no período', officialProfile].filter(Boolean).join(' · ')}</p></div></div></header>
    ${switcher([['presenca', 'Presença'], ['propostas', 'Propostas'], ['votos', 'Votos']], profilePath(person), view, 'Atividade do vereador')}
    ${content}`;
}

function personAttendance(activity) {
  return `<p class="section-note">Cada linha mostra o que ficou registrado em uma chamada de sessão ordinária ou extraordinária.</p>
    ${entries(activity.attendance.map(({ session, call, status: record }) => ({
      html: `<div><h2>${official(session.titulo, session.url)}</h2><p class="meta">${official(dateLabel(session.data), session.url)}${call.titulo ? ` · ${official(call.titulo, session.url)}` : ''}</p></div>${status(record)}`
    })), 'Sem chamada registrada para este parlamentar nas sessões consultadas.')}`;
}

function personProposals(person, group) {
  const data = proposalIndex(person);
  if (!data) {
    const link = person.propostasUrl ? ` ${official('Consulta oficial de autoria', person.propostasUrl)}.` : '';
    return `<p class="notice">A lista de propostas deste parlamentar está indisponível na coleta.${link}</p>`;
  }
  const route = profilePath(person, 'propostas');
  const incomplete = data.completo ? '' : '<p class="notice">A coleta deste perfil tem registros parciais. Os totais correspondem às propostas encontradas.</p>';
  const range = periodLabel(data.fonte, proposals.inicio, proposals.fim);
  if (Object.hasOwn(proposalGroups, group)) {
    const [title, description] = proposalGroups[group];
    const count = data.grupos[group];
    return `<a class="back group-back" href="${route}"><span aria-hidden="true">←</span> Todos os grupos</a>
      <div class="proposal-heading"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>
      <div class="proposal-count">${numeric(count, data.fonte, 'Propostas neste grupo')}<span>propostas</span></div></div>
      <p class="section-note">${range} · ${official('Lista oficial do autor', data.fonte)}</p>
      ${incomplete}${count ? '<div data-proposal-list aria-busy="true"><p class="notice" role="status">Carregando propostas…</p></div>' : '<p class="notice">Nenhuma proposta encontrada neste grupo.</p>'}`;
  }
  return `<div class="top-meta proposal-intro"><div><h2>Propostas por assunto</h2><p>${range}</p></div><a href="#fontes">Como classificamos</a></div>
    ${incomplete}<ul class="proposal-groups">${Object.entries(proposalGroups).map(([key, [title, description]]) => `<li class="proposal-group">
      <a class="proposal-group-open" href="${route}/${key}"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span><span aria-hidden="true">→</span></a>
      <div class="proposal-count">${numeric(data.grupos[key], data.fonte, title)}<span>propostas</span></div>
    </li>`).join('')}</ul><p class="section-note proposal-source">${official('Ver a lista oficial deste autor', data.fonte)}.</p>`;
}

function proposalEntry(proposal) {
  return `<li class="entry"><div><h3>${official(proposal.titulo, proposal.url)}</h3>
    <p class="meta">${official(dateLabel(proposal.data), proposal.url)}${proposal.tipo ? ` · ${escapeHtml(proposal.tipo)}` : ''}</p>
    <p class="body-copy">${escapeHtml(proposal.assunto || 'Assunto sem texto na listagem da Câmara.')}</p></div></li>`;
}

async function loadProposals(person, group) {
  const container = panel.querySelector('[data-proposal-list]');
  if (!container || !Object.hasOwn(proposalGroups, group) || !/^\d+$/.test(person?.id)) return;
  try {
    const response = await fetch(`propostas/${person.id}-${group}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    if (!container.isConnected) return;
    container.innerHTML = '<ul class="entry-list"></ul><button class="more" type="button">Mostrar mais propostas</button>';
    const list = container.querySelector('ul');
    const more = container.querySelector('button');
    const append = (moveFocus = false) => {
      const start = list.children.length;
      list.insertAdjacentHTML('beforeend', rows.slice(start, start + 25).map(proposalEntry).join(''));
      more.hidden = list.children.length === rows.length;
      if (moveFocus) list.children[start]?.querySelector('a')?.focus();
    };
    append();
    more.addEventListener('click', () => append(true));
  } catch {
    if (container.isConnected) {
      container.innerHTML = `<p class="notice" role="status">A lista não carregou. ${official('Ver propostas no Siscam', proposalIndex(person).fonte)}.</p><button class="more" type="button">Tentar novamente</button>`;
      container.querySelector('button').addEventListener('click', () => loadProposals(person, group));
    }
  } finally {
    container.removeAttribute('aria-busy');
  }
}

function secret(vote) {
  return vote.secreta || /secret|sigil|vot\.sec/i.test(`${vote.quorum || ''} ${vote.tipo || ''}`);
}

function personVotes(activity, person, filtro) {
  const naoSim = filtro === 'nao-sim';
  const registros = naoSim ? activity.votes.filter(row => ['nao', 'abstencao'].includes(tipoDeVoto(row))) : activity.votes;
  return `${naoSim ? `${back(profilePath(person, 'votos'), 'Ver todas as votações')}<h2 class="data-heading">Quando não votou sim</h2><p>Votos contrários e abstenções divulgados nominalmente pela Câmara.</p>` : '<p class="section-note">Registros individuais divulgados pela Câmara. Em votações secretas, os votos individuais ficam sem divulgação.</p>'}
    ${entries(registros.map(({ session, vote, status: record }) => ({
      html: `<div><h2>${official(vote.titulo, vote.url || session.url)}</h2>
        <p class="meta">${official(dateLabel(session.data), session.url)} · ${official(session.titulo, session.url)}</p>
        ${vote.assunto && vote.assunto !== vote.titulo ? `<p class="body-copy">${escapeHtml(vote.assunto)}</p>` : ''}
        ${vote.resultado ? `<p class="meta">Resultado da matéria · ${official(vote.resultado, session.url)}</p>` : ''}</div>${status(record)}`
    })), 'Sem registro individual para este parlamentar nas votações consultadas.')}`;
}

function sessionIndex() {
  return `${intro('Sessões da Câmara', 'Consulte a chamada e as matérias votadas nas sessões ordinárias e extraordinárias.')}
    <p class="section-note">${numeric(sessions.length, sessionSource, 'Sessões no recorte')} sessões · ${periodLabel(sessionSource)} · ${official('Busca oficial de sessões', sessionSource)}</p>
    ${entries(sessions.map(session => ({ html: `<div><h2>${official(session.titulo, session.url)}</h2><p class="meta">${official(dateLabel(session.data), session.url)}</p></div><a class="latest-action" href="#sessao/${encodeURIComponent(session.id)}">Ver sessão <span aria-hidden="true">→</span></a>` })), 'Sem sessões no recorte.')}`;
}

function sessionPage(id) {
  const session = sessions.find(item => String(item.id) === id);
  if (!session) return intro('Sessão não localizada') + back('#sessoes', 'Voltar às sessões');
  const calls = session.chamadas || [];
  const votes = session.votacoes || [];
  const ata = attendanceAudit?.sessoes[id];
  const notaAta = {
    diferenca: 'A lista de presentes da ata difere da chamada eletrônica.',
    data_diferente: ata?.data ? `A ata informa a data de ${dateLabel(ata.data)}.` : '',
    sem_chamada: 'A ata traz uma lista de presentes na abertura.',
  }[ata?.status];
  const chamadaAta = ata?.presentes ? `<details class="details-row"><summary>Ver presentes na abertura segundo a ata</summary>
    <ul class="names">${ata.presentes.map(nome => `<li>${escapeHtml(nome)}</li>`).join('')}</ul></details>` : '';
  return `${back('#sessoes', 'Todas as sessões')}
    <header class="profile-head"><h1>${official(session.titulo, session.url)}</h1><p>${official(dateLabel(session.data), session.url)} · ${official('Registro oficial da sessão', session.url)}</p></header>
    <h2 class="data-heading">Chamada</h2>
    ${calls.length ? calls.map(({ titulo, registros }) => `<div class="details-row"><h3>${official(titulo, session.url)}</h3>${recordGroups(registros, session.url)}</div>`).join('') : '<p class="notice">A ficha da sessão está sem chamada eletrônica.</p>'}
    ${ata ? `<p class="section-note">${notaAta ? escapeHtml(notaAta) + ' ' : ''}${official('Ler a ata oficial', ata.pdf)}.</p>` : ''}${chamadaAta}
    <h2 class="data-heading">Votações</h2>
    ${votes.length ? votes.map(vote => sessionVote(vote, session.url)).join('') : '<p class="notice">O registro disponível da sessão está sem votação publicada.</p>'}`;
}

function sessionVote(vote, source) {
  const type = [secret(vote) ? 'Votação secreta' : vote.tipo, vote.fase].filter(Boolean).map(item => escapeHtml(item));
  if (vote.resultado) type.push(`Resultado · ${official(vote.resultado, source)}`);
  const individual = vote.votos?.length ? recordGroups(vote.votos, source) : '<p class="notice">Sem votos individuais divulgados para esta matéria.</p>';
  return `<article class="details-row"><h3>${official(vote.titulo, vote.url || source)}</h3>
    ${vote.assunto && vote.assunto !== vote.titulo ? `<p class="body-copy">${escapeHtml(vote.assunto)}</p>` : ''}
    ${type.length ? `<p class="meta">${type.join(' · ')}</p>` : ''}
    <details><summary>Ver registros individuais</summary>${individual}</details></article>`;
}

function recordGroups(records, source) {
  const groups = new Map();
  for (const record of records) {
    if (!groups.has(record.situacao)) groups.set(record.situacao, []);
    groups.get(record.situacao).push(record);
  }
  return Array.from(groups, ([label, group]) => `<h4 class="group-title">${escapeHtml(label)} · ${numeric(group.length, source, label)}</h4><ul class="names">${group.map(record => {
    const person = findPerson(record);
    const name = escapeHtml(displayName(record.nome));
    return `<li>${person ? `<a href="${profilePath(person)}">${name}</a>` : name}</li>`;
  }).join('')}</ul>`).join('');
}

function money(value, url, label) {
  return numeric(Number.isFinite(value) ? value / 100 : null, url, label, moneyFormat);
}

function accounts(selected, period) {
  const current = selected === 'contratos' ? 'contratos' : 'despesas';
  const content = current === 'contratos' ? contracts(period) : expenses(period);
  return `${intro('Contas da Câmara', 'Consulte quanto a Câmara pagou, quem recebeu e quais contratos foram publicados.')}
    <p class="section-note account-period">${periodLabel(current === 'contratos' ? bethaSource : financeSource, finances?.inicio, finances?.fim)}</p>
    ${switcher([['despesas', 'Despesas'], ['contratos', 'Contratos']], '#contas', current, 'Contas da Câmara')}${content}`;
}

function expenses(period) {
  const months = finances?.despesas || [];
  const gaps = finances?.lacunasDespesas || [];
  const options = [...months, ...gaps].sort((a, b) => b.periodo.localeCompare(a.periodo));
  const month = options.find(item => item.periodo === period) || months[0] || options[0];
  if (!month) return '<p class="notice">As despesas não estão disponíveis nesta coleta.</p>';
  const sourceName = month.nomeFonte || 'TCE-SP';
  const select = `<div class="filter-line"><label class="select-label">Mês <select id="mes">${options.map(item => `<option value="${escapeHtml(item.periodo)}"${item === month ? ' selected' : ''}>${escapeHtml(dateLabel(`${item.periodo}-01`, monthFormat))}${!Array.isArray(item.pagamentos) ? ' · sem dados' : ''}</option>`).join('')}</select></label>${official(`Ver dados no ${sourceName}`, month.fonte)}</div>`;
  const monthsWithoutRecords = gaps.length ? `<p class="section-note">Meses sem dados nas fontes consultadas · ${gaps.map(item => official(dateLabel(`${item.periodo}-01`, monthFormat), item.fonte)).join(', ')}.</p>` : '';
  if (!Array.isArray(month.pagamentos)) {
    return `${select}<p class="notice">${escapeHtml(month.situacao || 'Sem dados publicados nesta consulta.')}</p>${monthsWithoutRecords}`;
  }
  const blocks = [
    ['Pago', month.totalPago, 'Valor desembolsado pela Câmara.'],
    ['Liquidado', month.totalLiquidado, 'Valor reconhecido como devido.'],
    ['Empenhado', month.totalEmpenhado, 'Valor reservado para despesas.']
  ];
  return `${select}${monthsWithoutRecords}
    <p class="section-note">Esta página mostra os lançamentos da fonte indicada para cada mês. Os totais no início do site usam o valor pago consolidado por empenho no portal da Câmara. <a href="#fontes">Confira a diferença entre as fontes</a>.</p>
    ${month.ultimaData ? `<p class="section-note">Última data de lançamento no arquivo deste mês · ${official(dateLabel(month.ultimaData), month.fonte)}.</p>` : ''}
    <div class="funding-metrics">${blocks.map(([title, value, description]) => `<article class="data-box"><div>${money(value, month.fonte, title)}</div><h3>${title}</h3><p>${description}</p></article>`).join('')}</div>
    <h2 class="data-heading">Pagamentos do mês</h2><p>${numeric(month.pagamentos.length, month.fonte, 'Lançamentos de pagamento')} lançamentos de pagamento. Os valores empenhado, liquidado e pago representam etapas da despesa.</p>
    ${entries(month.pagamentos.map(item => ({ html: `<div><h3>${escapeHtml(item.fornecedor || 'Fornecedor sem nome publicado')}</h3><p class="meta">${official(dateLabel(item.data), month.fonte)}${item.empenho ? ` · Empenho ${official(item.empenho, month.fonte)}` : ''}</p></div><div class="entry-side"><strong>${money(item.valor, month.fonte, 'Valor pago')}</strong></div>` })), 'Este mês está sem pagamentos na coleta.')}`;
}

function contracts(period) {
  const data = finances?.contratos;
  if (!data) return '<p class="notice">Os contratos não estão disponíveis nesta coleta.</p>';
  const years = (data.anos || [data.ano]).filter(Number.isInteger);
  const selected = years.find(year => String(year) === period);
  const list = selected ? data.lista.filter(item => String(item.ano || item.assinatura?.slice(0, 4) || item.numero?.split('/').at(-1)) === String(selected)) : data.lista;
  const chooser = years.length ? `<div class="filter-line"><label class="select-label">Ano <select id="ano-contratos"><option value="">Todo o período</option>${years.map(year => `<option value="${year}"${selected === year ? ' selected' : ''}>${year}</option>`).join('')}</select></label>${official('Dados Abertos da Câmara', data.fonte)}</div>` : '';
  return `${chooser}<p class="section-note">${numeric(list.length, data.fonte, 'Contratos publicados')} contratos ${selected ? `de ${official(selected, data.fonte)}` : 'no recorte consultado'}.</p>
    ${entries(list.map(item => {
      const source = item.fonte || data.fonte;
      const start = dateLabel(item.inicio);
      const end = dateLabel(item.fim);
      return { className: 'contract', html: `<div><h3>${official(`Contrato ${item.numero}`, source)} · ${escapeHtml(item.fornecedor)}</h3>
        ${item.objeto ? `<p class="body-copy">${escapeHtml(item.objeto)}</p>` : ''}
        ${item.assinatura ? `<p class="meta">Assinado em ${official(dateLabel(item.assinatura), source)}</p>` : ''}
        ${start && end ? `<p class="meta">Vigência de ${official(start, source)} a ${official(end, source)}</p>` : ''}</div>
        <div class="entry-side"><strong>${money(item.valor, source, 'Valor do contrato')}</strong><p class="meta">Valor do contrato</p></div>` };
    }), 'Sem contratos publicados no arquivo consultado.')}`;
}

function idealizador() {
  return `${intro('O Idealizador')}
    <div class="idealizador-layout">
      <header class="idealizador-intro">
        <h2>Rafael Zaniboni</h2>
        <p><strong>Idealizador do Radar Araras</strong></p>
      </header>
      <aside class="idealizador-perfil" aria-label="Foto e contato de Rafael Zaniboni">
        <figure class="idealizador-foto">
          <img src="rafael-zaniboni.png" alt="Rafael Zaniboni, idealizador do Radar Araras" width="1086" height="1448" decoding="async">
          <figcaption>
            <blockquote>A democracia não termina nas urnas. A fiscalização começa depois delas.</blockquote>
            <p>Rafael Zaniboni · Idealizador do Radar Araras</p>
          </figcaption>
        </figure>
        <a class="contato-whatsapp" href="https://wa.me/5519997538385" target="_blank" rel="noopener noreferrer" aria-label="Entrar em contato com Rafael Zaniboni pelo WhatsApp, abre em nova aba">
          <img src="contato-whatsapp.png" alt="Entre em contato pelo WhatsApp. Clique aqui." width="381" height="147" decoding="async">
        </a>
        <div class="redes-sociais">
          <p>Siga minhas redes sociais</p>
          <div>
            <a href="https://www.instagram.com/rafazaniboni/" target="_blank" rel="noopener noreferrer" aria-label="Instagram de Rafael Zaniboni, abre em nova aba"><img src="instagram.svg" alt="Instagram" width="25" height="25" loading="lazy"></a>
            <a href="https://www.facebook.com/rafael.zaniboni.1" target="_blank" rel="noopener noreferrer" aria-label="Facebook de Rafael Zaniboni, abre em nova aba"><img src="facebook.svg" alt="Facebook" width="25" height="25" loading="lazy"></a>
            <a href="https://www.linkedin.com/in/rafaelzaniboni/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn de Rafael Zaniboni, abre em nova aba"><img src="linkedin.svg" alt="LinkedIn" width="25" height="25" loading="lazy"></a>
          </div>
        </div>
      </aside>
      <article class="idealizador-texto" aria-label="Apresentação de Rafael Zaniboni">
        <p>Sou Rafael Zaniboni, profissional com formação em Publicidade e Propaganda, pós-graduações em Marketing e Redes Sociais e Comunicação Política e no Setor Público, além de formação em Mídias Interativas.</p>
        <p>Ao longo da minha trajetória profissional, construí experiência nas áreas de marketing, comunicação institucional, planejamento estratégico, desenvolvimento comercial e gestão empresarial. Também tive experiências na administração pública, que ampliaram minha visão sobre gestão, processos administrativos, políticas públicas e a importância da transparência na utilização dos recursos públicos.</p>

        <h3>Minha relação com a política: uma história que começou na infância</h3>
        <p>Minha relação com a política vem de muito antes da minha trajetória profissional. Ela começou ainda na infância, acompanhando de perto os passos do meu pai, Tutu Zaniboni, em sua atuação política na região. Foi observando sua caminhada, suas relações com a comunidade e seu envolvimento com a vida pública que comecei a despertar meu interesse pela política e pela administração pública.</p>
        <p>Desde pequeno, as sessões da Câmara Municipal de Araras fizeram parte da minha história. Cresci acompanhando os debates, as discussões, as decisões e os bastidores do Legislativo municipal.</p>
        <p>Mais tarde, tive a oportunidade de vivenciar esse ambiente ainda mais de perto, quando exerci a função de <strong>Chefe de Gabinete do saudoso Francisco Nucci Neto, o querido Dr. Nucci, como era conhecido em nossa cidade</strong>.</p>
        <p>Essa experiência me proporcionou uma visão prática do funcionamento da Câmara Municipal, dos processos legislativos, da elaboração e tramitação de documentos, do relacionamento entre os parlamentares e das responsabilidades que envolvem um mandato público.</p>
        <p>A política, portanto, nunca foi para mim apenas uma disputa eleitoral ou uma discussão partidária. É algo que acompanho desde cedo, que faz parte da minha história e que me ensinou a importância da participação, do diálogo, da responsabilidade e, principalmente, do compromisso com a população.</p>
        <p>Foi também dessa vivência que nasceu uma convicção: <strong>o cidadão precisa conhecer, acompanhar e compreender o trabalho daqueles que foram escolhidos para representá-lo.</strong></p>

        <h3>Por que criei o Radar Araras?</h3>
        <p>Acredito que a democracia não termina nas urnas. Pelo contrário: é justamente depois das eleições que começa uma das maiores responsabilidades do cidadão: acompanhar, fiscalizar e cobrar aqueles que receberam o voto de confiança da população.</p>
        <p>Foi a partir dessa visão que nasceu o Radar Araras.</p>
        <p>Percebi que existe uma grande distância entre as informações disponibilizadas pelo Poder Legislativo e o acompanhamento efetivo dessas informações pela população. Os dados são públicos, mas nem sempre são apresentados de maneira simples, organizada e acessível para que qualquer cidadão consiga compreender o que seus representantes estão fazendo.</p>
        <p>E foi justamente para mudar isso que decidi desenvolver esta plataforma.</p>
        <p>O Radar Araras reúne e organiza automaticamente informações oficiais da Câmara Municipal de Araras, permitindo acompanhar a atuação dos vereadores, seus requerimentos, indicações, projetos, participações, registros e outras atividades parlamentares.</p>
        <p><strong>Não basta eleger. É preciso acompanhar. Não basta confiar. É preciso fiscalizar. E não basta reclamar. É preciso cobrar.</strong></p>
        <p>Não se trata de perseguir políticos, defender partidos ou favorecer grupos. Trata-se de dar visibilidade à informação pública e oferecer à população uma ferramenta para exercer seu direito de fiscalização.</p>
        <p>Afinal, o mandato pertence ao povo, e prestar contas à população não deveria ser uma opção, mas uma obrigação.</p>
        <p><strong>O Radar Araras é uma iniciativa independente de transparência e fiscalização cidadã. Porque quem ocupa um cargo público precisa saber que está sendo acompanhado.</strong></p>

        <footer class="idealizador-assinatura">
          <p><strong>Rafael Zaniboni</strong><br>Idealizador do Radar Araras</p>
        </footer>
      </article>
    </div>`;
}

function sources() {
  const estimativaSalarios = estimarSalarios(radarPagamentos);
  const updated = legislative?.fim ? `<p class="notice">Período consultado de ${periodLabel(sessionSource)}. As fontes podem publicar registros com atraso.</p>` : '';
  const coverage = legislative?.cobertura;
  const presence = coverage ? ` A Câmara publicou chamada em ${numeric(coverage.comChamada, sessionSource, 'Sessões com chamada')} das ${numeric(sessions.length, sessionSource, 'Sessões consultadas')} sessões consultadas.` : '';
  const aud = attendanceAudit?.totais;
  const auditNote = aud ? `<p>Entre as atas com a mesma data da ficha e com chamada eletrônica, os nomes coincidem em ${numeric(aud.coincidiu, sessionSource, 'Sessões com os mesmos presentes')} sessões e divergem em ${numeric(aud.diferenca, sessionSource, 'Sessões com listas divergentes')}. Em outras ${numeric(aud.data_diferente, sessionSource, 'Atas com data divergente')}, as datas diferem. A ata lista presentes em ${numeric(aud.sem_chamada, sessionSource, 'Atas com presentes e sem chamada eletrônica')} sessões sem chamada eletrônica. ${official('Exemplo de divergência na ata de 26 de outubro de 2026', 'https://araras.siscam.com.br/arquivo?Id=239401')}.</p>` : '';
  return `${intro('Fontes e como os dados são contados', 'Os números levam aos registros da Câmara Municipal ou do Tribunal de Contas.')}
    ${updated}
    <ul class="source-list">
      <li><h2>Quem aparece</h2><p>A lista em exercício vem da consulta oficial. Parlamentares que aparecem nas sessões do período também podem ser consultados. ${official('Lista de vereadores no Siscam', rosterSource)}.</p></li>
      <li><h2>Presença</h2><p>O recorte usa a data da sessão ordinária ou extraordinária. O percentual no cartão divide as presenças pelas sessões com situação de chamada registrada para o vereador. Cada sessão conta uma vez. A ausência em uma votação só descreve aquela votação.${presence} ${official('Consulta de sessões no Siscam', sessionSource)}.</p>${auditNote}</li>
      <li><h2>Como classificamos as propostas</h2><p>A classificação automática usa o tipo e o assunto publicados no Siscam. Cada matéria entra em um só grupo. A mesma regra e a ordem abaixo valem para todos os autores.</p>
        <ol class="classification-rule">${(proposals?.ordem || []).map(key => `<li><strong>${escapeHtml(proposalGroups[key][0])}.</strong> ${escapeHtml(proposalGroups[key][1])}</li>`).join('')}</ol>
        <p>Uma lei que nomeia uma rua entra em homenagens. Um pedido de informação sobre uma obra entra em perguntas e cobranças. Uma convocação para votar um título entra em outros. A lista reúne matérias de autoria parlamentar. ${official('Pesquisa oficial de proposituras', proposalsSource)}.</p></li>
      <li><h2>Busca por bairro ou rua</h2><p>A busca usa os nomes e as abreviações que aparecem nos assuntos publicados. Cada documento conta uma vez, mesmo com mais de um autor. As repetições cruzam documentos com uma rua identificável e o mesmo tipo de solicitação. Para ruas numeradas, o bairro também precisa estar indicado. Pedidos de informação entram em grupos próprios. ${escapeHtml(avisoRepeticao)} ${official('Pesquisa no Siscam', proposalsSource)}.</p></li>
      <li><h2>Votos</h2><p>O total usa os votos a favor, contra e as abstenções divulgadas nominalmente. A comparação de votos iguais considera votações nominais com pelo menos dois votos publicados dessas três formas. O detalhe mantém as situações registradas pela Câmara, como “Não vota” e “Ausente”. ${official('Votações no Siscam', sessionSource)}.</p></li>
      <li><h2>Pagamentos registrados pela Câmara</h2><p>Os valores registrados nos três quadros somam o valor pago de cada empenho desde a posse, em 1º de janeiro de 2025. O primeiro reúne subsídios, décimo terceiro e férias identificados como pagamentos aos vereadores e a suplentes em exercício. O segundo reúne os demais gastos de funcionamento, incluindo contratos, salários de servidores e horas extras. Despesas de um exercício pagas em outro entram no ano em que o pagamento ocorreu, quando a data está confirmada. ${official('Execução Detalhada de Despesas no portal da Câmara', bethaSource)}.</p>
      <p>O contador de salários é uma estimativa atualizada a cada segundo. Dividimos o total pago registrado aos vereadores e suplentes pelos segundos entre 1º de janeiro de 2025, no horário de Araras, e a data e hora da consulta oficial. Essa média já reúne todos os parlamentares pagos no período. Ao total registrado, somamos a média por segundo multiplicada pelos segundos transcorridos desde a consulta. O valor pago registrado aparece logo abaixo do contador. Novos dados oficiais refazem a base e a média. A projeção termina em 31 de dezembro de 2028. ${official('Fonte dos pagamentos usados no cálculo', bethaSource)}.</p>
      ${estimativaSalarios ? `<p>Avanço estimado de ${official(formatoTaxaSalarios.format(estimativaSalarios.taxa / 100), bethaSource)} por segundo, pela média dos pagamentos desde a posse.</p>` : ''}
      <p>O terceiro quadro reúne despesas cuja rubrica ou descrição identifica viagem, como adiantamentos e reembolsos, hospedagem, passagens, alimentação em viagem, pedágios e estacionamentos. Limites de classificação vêm das descrições publicadas. Alimentação de rotina, combustível de uso geral e estacionamento institucional entram em despesas de funcionamento. Cada empenho conta em um único quadro. ${official('Relatórios mensais de viagens da Câmara', `${council}Pagina/Listar/605`)}.</p></li>
      <li><h2>Despesas por mês</h2><p>Os meses com dados do TCE-SP seguem o mês informado pelo Tribunal. Nos demais meses, o quadro mostra as parcelas da execução de despesas da Câmara na data de cada lançamento. Cada mês indica sua fonte. ${official('API oficial do TCE-SP', financeSource)} · ${official('Dados Abertos da Câmara', bethaSource)}.</p></li>
      <li><h2>Contratos</h2><p>O arquivo anual de contratos fica na seção Dados Abertos. Os valores exibidos correspondem aos valores finais informados no arquivo. ${official('Dados Abertos do portal Betha', bethaSource)}.</p></li>
      <li><h2>Câmara Municipal de Araras</h2><p>${official('Site oficial da Câmara', council)} · ${official('Serviço de Informação ao Cidadão', `${council}Sic/Cidadao`)}.</p></li>
    </ul>`;
}

function installSearch() {
  const search = document.querySelector('#busca');
  if (!search) return;
  const partido = document.querySelector('#filtro-partido');
  const ordem = document.querySelector('#ordem-vereadores');
  const totalAtual = people.filter(person => person.emExercicio).length;
  const ordenar = person => {
    const resumo = resumoPorPessoa.get(personKey(person));
    if (ordem.value === 'ausencias') return resumo.presenca.total ? resumo.presenca.ausente : -1;
    if (ordem.value === 'nao') return resumo.votosPublicados ? resumo.votos.nao : -1;
    return proposalIndex(person)?.grupos[ordem.value] ?? -1;
  };
  const filtrar = () => {
    const query = normalize(search.value);
    const matches = people.filter(person => (!partido.value || person.partido === partido.value)
      && normalize(`${publicName(person)} ${person.nome} ${person.partido || ''}`).includes(query));
    if (ordem.value !== 'nome') matches.sort((a, b) => ordenar(b) - ordenar(a) || nameOrder.compare(publicName(a), publicName(b)));
    const current = matches.filter(person => person.emExercicio);
    const former = matches.filter(person => !person.emExercicio);
    document.querySelector('#em-exercicio').innerHTML = current.map(personCard).join('');
    const formerSection = document.querySelector('#outros');
    if (formerSection) {
      formerSection.hidden = !former.length;
      document.querySelector('#fora-exercicio').innerHTML = former.map(personCard).join('');
    }
    document.querySelector('#conta-vereadores').innerHTML = `Mostrando ${numeric(current.length, rosterSource, 'Vereadores no filtro')} de ${numeric(totalAtual, rosterSource, 'Vereadores em exercício')} vereadores em exercício.`;
    document.querySelector('#sem-resultados').hidden = matches.length !== 0;
  };
  search.addEventListener('input', filtrar);
  partido.addEventListener('change', filtrar);
  ordem.addEventListener('change', filtrar);
}

function showPage() {
  const [page = 'inicio', id, detail, group] = location.hash.slice(1).split('/');
  if (page === 'conteudo') return;
  let active = 'inicio';
  if (page === 'contas') {
    active = page;
    panel.innerHTML = accounts(id, detail);
  } else if (page === 'fontes') {
    active = page;
    panel.innerHTML = sources();
  } else if (page === 'idealizador') {
    active = page;
    panel.innerHTML = idealizador();
  } else if (!legislative) {
    panel.innerHTML = `${intro('Vereadores de Araras')}<p class="notice">Os registros legislativos estão indisponíveis. ${official('Consultar o site oficial', rosterSource)}.</p>`;
  } else if (page === 'sessoes' || page === 'sessao') {
    active = 'sessoes';
    panel.innerHTML = page === 'sessao' ? sessionPage(id) : sessionIndex();
  } else if (page === 'vereador') {
    active = 'vereadores';
    const person = peopleByRoute.get(id);
    panel.innerHTML = personPage(person, detail, group);
    if (detail === 'propostas' && group) loadProposals(person, group);
  } else {
    active = page || 'inicio';
    if (!panel.querySelector('#radar') || (page === 'bairros' && id)) {
      let texto = '';
      try { texto = page === 'bairros' && id ? decodeURIComponent(id) : ''; } catch { texto = ''; }
      panel.innerHTML = dashboard();
      installSearch();
      instalarRadar(panel.querySelector('#radar'), texto);
    }
    const section = ['bairros','repetidos','propostas','vereadores'].includes(page) && document.getElementById(page);
    if (section) requestAnimationFrame(() => { section.scrollIntoView(); section.focus({preventScroll:true}); });
    else window.scrollTo(0, 0);
  }
  for (const item of document.querySelectorAll('[data-page]')) {
    if (item.dataset.page === active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  document.title = panel.querySelector('#radar') ? 'Radar Araras' : `${panel.querySelector('h1')?.textContent || 'Consulta'} · Radar Araras`;
}

panel.addEventListener('click', event => {
  const button = event.target.closest('[data-more]');
  if (!button) return;
  const hiddenRows = Array.from(button.previousElementSibling.querySelectorAll('li[hidden]'));
  hiddenRows.slice(0, 15).forEach(row => { row.hidden = false; });
  if (hiddenRows.length <= 15) {
    button.remove();
    const first = hiddenRows[0];
    const focusTarget = first?.querySelector('a');
    if (focusTarget) focusTarget.focus();
  }
});

panel.addEventListener('change', event => {
  if (event.target.id === 'mes') location.hash = `#contas/despesas/${event.target.value}`;
  if (event.target.id === 'ano-contratos') location.hash = `#contas/contratos${event.target.value ? `/${event.target.value}` : ''}`;
});

panel.addEventListener('error', event => {
  if (event.target.matches('.avatar img')) event.target.hidden = true;
}, true);

window.addEventListener('hashchange', () => {
  if (location.hash === '#conteudo') return;
  showPage();
  if (!panel.querySelector('#radar')) {
    window.scrollTo(0, 0);
    document.querySelector('main').focus({ preventScroll: true });
  }
});

showPage();
