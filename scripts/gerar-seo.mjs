/** Gera HTML público a partir da mesma base oficial usada pela interface. Sem requisições de rede. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argumento = process.argv.indexOf('--dist');
const dist = path.resolve(argumento >= 0 ? process.argv[argumento + 1] : path.join(raiz, 'dist'));
if (dist !== path.join(raiz,'dist') && !dist.startsWith(path.join(raiz,'.build') + path.sep)) throw Error('Destino fora do projeto.');
const config = JSON.parse(fs.readFileSync(path.join(raiz,'config/seo.json'),'utf8'));
const origem = config.origem;
if (origem !== 'https://radarararas.com.br') throw Error('Domínio público inesperado.');
const ler = nome => fs.readFileSync(path.join(dist,nome),'utf8');
const gravar = (nome, conteudo) => { const alvo = path.resolve(dist,nome); if (!alvo.startsWith(dist+path.sep)) throw Error('Caminho inválido.'); fs.mkdirSync(path.dirname(alvo),{recursive:true}); fs.writeFileSync(alvo,conteudo); };
const hash = texto => createHash('sha256').update(texto).digest('hex');
const escapar = valor => String(valor ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug = texto => String(texto).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const jsonSeguro = valor => JSON.stringify(valor).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
const anterior = fs.existsSync(path.join(dist,'seo-manifest.json')) ? JSON.parse(ler('seo-manifest.json')) : null;
const relatorio = JSON.parse(ler('atualizacao.json'));
if (relatorio.aprovado !== true) throw Error('SEO exige uma base aprovada.');
const revisao = ler('index.html').match(/data-coleta="([a-f0-9]{20})"/)?.[1];
if (!revisao) throw Error('A base não tem revisão.');
const territorio = JSON.parse(ler('territorio.json'));
const historicoCompleto = JSON.parse(ler('historico-documentos.json'));
const imagens = fs.existsSync(path.join(dist,'imagens.json')) ? JSON.parse(ler('imagens.json')) : null;
const favicon = JSON.parse(ler('favicon.json'));
const revisaoFavicon = favicon.mestreSha256.slice(0,12);
const fakePanel = { addEventListener() {}, querySelector() {return null;} };
const contexto = vm.createContext({console,Intl,URL,URLSearchParams,document:{
  addEventListener() {},
  querySelector(s) { return s === '#painel' ? fakePanel : {getBoundingClientRect(){return {height:90};}}; },
  documentElement:{dataset:{coleta:revisao},style:{setProperty(){}}}
},ResizeObserver:class{observe(){}}, setInterval(){},clearInterval(){}});
for (const nome of ['legislativo','auditoria-presencas','financas','pagamentos','propostas','historico-documentos','territorio-resumo','radar']) vm.runInContext(ler(nome+'.js'),contexto,{filename:nome+'.js'});
const aplicativo = ler('app.js').split("panel.addEventListener('click', event => {")[0];
vm.runInContext(aplicativo,contexto,{filename:'app.js'});
const executar = expressao => vm.runInContext(expressao,contexto);
const pessoas = executar('people.map(p => ({...p,nomePublico:publicName(p),chave:personKey(p)}))');
const sessoes = executar('sessions');
const grupos = contexto.ARARAS_PROPOSTAS.grupos;
const fim = contexto.ARARAS_PROPOSTAS.fim;
const pagamentos = contexto.ARARAS_PAGAMENTOS;
const n = valor => new Intl.NumberFormat('pt-BR').format(valor);
const data = valor => new Intl.DateTimeFormat('pt-BR',{dateStyle:'long',timeZone:'UTC'}).format(new Date(valor+'T12:00:00Z'));
const fontePropostas = 'https://araras.siscam.com.br/index/74/8';
const fonteSessoes = 'https://araras.siscam.com.br/sessoes';
const fonteBetha = 'https://transparencia.betha.cloud/#/3EqrsBn0TZZ9CBAkiNBwSw==/dados-abertos';
const oficial = (texto,fonte) => `<a href="${escapar(fonte)}" target="_blank" rel="noopener">${escapar(texto)}</a>`;
const periodo = `<p class="section-note" data-periodo-coleta>Dados de ${oficial(data('2025-01-01'),fontePropostas)} a ${oficial(data(fim),fontePropostas)}. <a href="/fontes/">Fontes, critérios e limites da coleta</a>.</p>`;
const paginas = [];
const rotas = {};
function adicionar(url,titulo,descricao,corpo,opcoes={}) {
  if (paginas.some(p=>p.url===url)) throw Error('URL duplicada: '+url);
  const pagina = {url,titulo,descricao,corpo,...opcoes};
  paginas.push(pagina);
  for (const rota of opcoes.rotas || []) rotas[rota] = url;
  return pagina;
}
const mapaPessoas = new Map(pessoas.map(p=>[String(p.id),p]));
const perfilUrl = p => `/vereadores/${slug(p.nomePublico)}-${p.id || 'registros'}/`;
const grupoUrl = grupo => `/propostas/${{melhorias:'pedidos-de-melhoria',perguntas:'perguntas-e-cobrancas',homenagens:'homenagens',leis:'propostas-de-lei',outros:'outros'}[grupo]}/`;
function paginacao(base,pagina,total) {
  const url = i => i===1 ? base : `${base}pagina/${i}/`;
  return total>1 ? `<nav class="seo-paginacao" aria-label="Paginação">${pagina>1?`<a rel="prev" href="${url(pagina-1)}">Página anterior</a>`:''}<span>Página ${pagina} de ${total}</span>${pagina<total?`<a rel="next" href="${url(pagina+1)}">Próxima página</a>`:''}</nav>` : '';
}
function listarPropostas(lista,base,titulo,descricao,cabecalho,opcoes={}) {
  const total = Math.max(1,Math.ceil(lista.length/40));
  for (let i=1;i<=total;i++) {
    const url = i===1?base:`${base}pagina/${i}/`;
    const lote = lista.slice((i-1)*40,i*40);
    contexto.loteSEO = lote;
    const linhas = executar('loteSEO.map(pedidoNoRadar).join("")');
    const corpo = `${cabecalho}${paginacao(base,i,total)}<ul class="radar-pedidos">${linhas}</ul>${paginacao(base,i,total)}`;
    adicionar(url,`${titulo}${i>1?` — página ${i}`:''} | Radar Araras`,`${descricao}${i>1?` Página ${i}.`:''}`,corpo,{...opcoes,rotas:i===1?opcoes.rotas:[]});
  }
}
const linksGuias = '<nav class="seo-atalhos" aria-label="Entenda a Câmara"><a href="/entenda/">Entenda a Câmara</a><a href="/boletim/">Resumo dos registros recentes</a><a href="/bairros-e-ruas/locais/">Consultar os locais citados</a></nav>';
adicionar('/','Radar Araras: vereadores, propostas e gastos da Câmara','Acompanhe os vereadores de Araras/SP: propostas, presença, votos e despesas desde 2025, com links para as fontes oficiais.',executar('dashboard()')+linksGuias,{interativo:true,rotas:['inicio']});
adicionar('/vereadores/','Vereadores de Araras: propostas, presença e votos | Radar Araras','Consulte a atuação dos vereadores de Araras/SP, com dados oficiais de presença, propostas e votações desde 2025.',executar('home()').replace(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/,'<h1$1>$2</h1>'),{interativo:true,ativo:'vereadores',rotas:['vereadores']});
for (const p of pessoas) {
  const base = perfilUrl(p);
  const id = JSON.stringify(p.chave);
  const expr = `peopleByRoute.get(${id})`;
  const rota = `vereador/${p.chave}`;
  const comum = {ativo:'vereadores',pessoa:p};
  adicionar(base,`${p.nomePublico}: presença, propostas e votos em Araras | Radar Araras`,`Consulte os registros de ${p.nomePublico} na Câmara de Araras: presenças, propostas e votos entre 2025 e ${fim.slice(0,4)}.`,executar(`personPage(${expr},'presenca')`),{...comum,rotas:[rota,rota+'/presenca']});
  adicionar(base+'votos/',`Como votou ${p.nomePublico}, vereador em Araras | Radar Araras`,`Votos individuais publicados pela Câmara de Araras para ${p.nomePublico}, com sessão e documento oficial.`,executar(`personPage(${expr},'votos')`),{...comum,rotas:[rota+'/votos']});
  adicionar(base+'votos/contrarios-e-abstencoes/',`Votos contrários e abstenções de ${p.nomePublico} | Radar Araras`,`Consulte os votos contrários e as abstenções publicados para ${p.nomePublico}, com links para as sessões da Câmara de Araras.`,executar(`personPage(${expr},'votos','nao-sim')`),{...comum,rotas:[rota+'/votos/nao-sim']});
  adicionar(base+'propostas/',`Propostas de ${p.nomePublico} em Araras | Radar Araras`,`Leia as propostas de ${p.nomePublico}, separadas por assunto e com links oficiais da Câmara de Araras.`,executar(`personPage(${expr},'propostas')`),{...comum,noindex:!contexto.ARARAS_PROPOSTAS.perfis[p.id],rotas:[rota+'/propostas']});
  if (!contexto.ARARAS_PROPOSTAS.perfis[p.id]) continue;
  for (const [grupo,[rotulo]] of Object.entries(grupos)) {
    const lista = territorio.pedidos.filter(r=>r.grupo===grupo && r.autores.includes(String(p.id)));
    const cabecalho = `<a class="back" href="${base}propostas/">Todos os grupos de ${escapar(p.nomePublico)}</a><header class="page-intro"><h1>${escapar(rotulo)} de ${escapar(p.nomePublico)}</h1><p>${escapar(grupos[grupo][1])}</p></header>${periodo}<p>${oficial(n(lista.length),contexto.ARARAS_PROPOSTAS.perfis[p.id]?.fonte||fontePropostas)} propostas neste grupo.</p>`;
    listarPropostas(lista,base+'propostas/'+grupo+'/',`${rotulo} de ${p.nomePublico}`,`Leia ${rotulo.toLowerCase()} de ${p.nomePublico} na Câmara de Araras, com datas e fontes oficiais.`,cabecalho,{...comum,noindex:lista.length===0,rotas:[rota+`/propostas/${grupo}`]});
  }
}
adicionar('/sessoes/','Sessões da Câmara Municipal de Araras: presenças e votos | Radar Araras','Consulte as sessões ordinárias e extraordinárias de Araras desde 2025, com chamadas, atas e votos publicados.',executar('sessionIndex()'),{ativo:'sessoes',rotas:['sessoes']});
for (const s of sessoes) adicionar(`/sessoes/${s.id}/`,`${s.titulo} de Araras | Radar Araras`,`Registros de ${data(s.data)}: chamada, ata e votações da ${s.titulo}, na Câmara de Araras.`,executar(`sessionPage(${JSON.stringify(String(s.id))})`),{ativo:'sessoes',rotas:[`sessao/${s.id}`]});
const meses = [...contexto.ARARAS_FINANCAS.despesas,...(contexto.ARARAS_FINANCAS.lacunasDespesas||[])];
const quadro = executar('quadroPagamentos(radarPagamentos,false)');
adicionar('/contas-da-camara/','Gastos da Câmara de Araras: salários, contratos e viagens | Radar Araras','Consulte os pagamentos registrados pela Câmara de Araras desde 2025, separados em vereadores, demais despesas e viagens.',`<header class="page-intro"><h1>Contas da Câmara Municipal de Araras</h1><p>Valores pagos registrados nas fontes oficiais.</p></header>${quadro}<nav class="seo-atalhos"><a href="/contas-da-camara/despesas/">Despesas por mês</a><a href="/contas-da-camara/contratos/">Contratos publicados</a></nav>${periodo}`,{ativo:'contas',rotas:['contas']});
adicionar('/contas-da-camara/despesas/','Despesas mensais da Câmara de Araras | Radar Araras','Pagamentos, valores liquidados e empenhados da Câmara Municipal de Araras, por mês e com fonte oficial.',executar("accounts('despesas')"),{ativo:'contas',rotas:['contas/despesas']});
for (const mes of meses) adicionar(`/contas-da-camara/despesas/${mes.periodo}/`,`Despesas da Câmara de Araras em ${mes.periodo} | Radar Araras`,`Consulte pagamentos registrados no período ${mes.periodo}, com valores, fornecedores e fonte oficial.`,executar(`accounts('despesas',${JSON.stringify(mes.periodo)})`),{ativo:'contas',rotas:[`contas/despesas/${mes.periodo}`]});
for (const ano of ['',...(contexto.ARARAS_FINANCAS.contratos.anos || [])]) adicionar(`/contas-da-camara/contratos/${ano?ano+'/':''}`,`Contratos da Câmara de Araras${ano?' em '+ano:''} | Radar Araras`,'Contratos publicados pela Câmara de Araras: fornecedores, objetos, valores e vigência, com links oficiais.',executar(`accounts('contratos',${JSON.stringify(String(ano))})`),{ativo:'contas',rotas:[`contas/contratos${ano?'/'+ano:''}`]});
adicionar('/fontes/','Fontes oficiais, metodologia e limites dos dados | Radar Araras','Saiba de onde vêm os números do Radar Araras, como as propostas são classificadas e quais dados não puderam ser confirmados.',executar('sources()')+`<section class="seo-texto"><h2>Baixar os dados organizados</h2><p>Base de propostas deduplicadas e lugares identificados automaticamente nos textos oficiais: <a href="/territorio.json">baixar JSON</a>. <a href="/atualizacao.json">Consultar o relatório da coleta aprovada</a>.</p><p>O Radar Araras é uma iniciativa independente. A organização e os cálculos são do projeto; os registros de origem são da Câmara e do TCE-SP.</p></section>`,{ativo:'fontes',rotas:['fontes','transparencia']});
adicionar('/o-idealizador/','Rafael Zaniboni, idealizador do Radar Araras', 'Conheça Rafael Zaniboni e a proposta do Radar Araras, iniciativa independente de transparência e fiscalização cidadã em Araras/SP.',executar('idealizador()'),{ativo:'idealizador',rotas:['idealizador']});
const formBusca = '<form class="seo-busca" data-busca-estatica action="/bairros-e-ruas/" method="get" role="search"><label class="sr-only" for="busca-seo">Bairro ou rua</label><input id="busca-seo" type="search" name="busca" placeholder="Digite seu bairro ou sua rua" maxlength="130"><button>Buscar</button></form>';
const dashboard = executar('dashboard()');
const trechoBairros = dashboard.slice(dashboard.indexOf('    <section id="bairros"'),dashboard.indexOf('    <section id="propostas"'));
const dialogo = dashboard.slice(dashboard.indexOf('    <dialog'),dashboard.indexOf('</dialog>')+9);
adicionar('/bairros-e-ruas/','O que pediram para seu bairro ou rua em Araras? | Radar Araras','Busque pedidos por bairro ou rua em Araras. Veja autores, datas, documentos e solicitações que voltaram a aparecer.',`<header class="page-intro"><h1>Bairros e ruas de Araras</h1><p>Encontre o que os vereadores pediram para cada lugar.</p></header><div id="radar">${trechoBairros}${dialogo}</div><p><a href="/bairros-e-ruas/locais/">Abrir a lista dos locais identificados</a></p>`,{interativo:true,ativo:'bairros',rotas:['bairros','repetidos']});
// Publica páginas locais somente com mais evidências; os demais termos continuam pesquisáveis.
const ruasRecorrentes = new Set(territorio.repetidos.filter(r=>r.pedidos.length>=3).map(r=>r.ruaKey));
const locais = territorio.lugares.filter(l=>l.total>=3 && l.nome.length<=80 && l.nome.trim().length>=3 &&
  (l.tipo==='rua' ? ruasRecorrentes.has(l.key) : /^bairro:(?:centro$|jardim |parque |vila |residencial |loteamento |conjunto habitacional |nucleo habitacional |distrito |fazenda |assentamento )/.test(l.key)));
const locaisUrl = new Map(locais.map(l=>[l.key,`/${l.tipo==='bairro'?'bairros':'ruas'}/${slug(l.nome)}-${hash(l.key).slice(0,6)}/`]));
adicionar('/bairros-e-ruas/locais/','Bairros e ruas citados nas propostas de Araras | Radar Araras','Consulte locais citados nas propostas e ruas com pedidos recorrentes nos documentos da Câmara de Araras.',`<header class="page-intro"><h1>Locais citados nas propostas</h1><p>Locais identificados automaticamente em pelo menos três propostas. As páginas de ruas destacam locais com pelo menos três pedidos recorrentes do mesmo tipo. Os nomes vêm dos textos dos documentos; esta lista não é um cadastro oficial de bairros e ruas. Outros locais podem ser consultados na busca.</p></header>${formBusca}${periodo}<ul class="seo-links">${locais.map(l=>`<li><a href="${locaisUrl.get(l.key)}">${escapar(l.nome)}</a><p>${oficial(n(l.total),executar(`fonteLocal(${JSON.stringify(l.nome)})`))} propostas citam este local.</p></li>`).join('')}</ul>`,{ativo:'bairros'});
for (const l of locais) {
  const lista = territorio.pedidos.filter(p=>p[l.tipo+'s'].includes(l.key));
  if (lista.length!==l.total) throw Error('Contagem de local divergente: '+l.key);
  const base = locaisUrl.get(l.key);
  const repetidos = territorio.repetidos.filter(r=>(r.ruaKey===l.key||r.bairroKey===l.key));
  const repeticoes = repetidos.length ? `<h2>Pedidos que voltaram a aparecer</h2>${repetidos.map(r=>`<details class="details-row"><summary>${escapar(r.rua)} · ${escapar(r.tema)} · ${oficial(n(r.pedidos.length),executar(`fonteLocal(${JSON.stringify(r.rua)})`))} pedidos</summary><ul>${r.pedidos.map(id=>{const p=territorio.pedidos.find(p=>p.id===id);return `<li>${oficial(data(p.data),`https://araras.siscam.com.br/Documentos/Documento/${p.id}`)} — ${p.autores.map(id=>escapar(mapaPessoas.get(id)?.nomePublico||id)).join(', ')}</li>`;}).join('')}</ul></details>`).join('')}` : '';
  const cabecalho = `<a class="back" href="/bairros-e-ruas/locais/">Todos os locais</a><header class="page-intro"><h1>O que pediram para ${escapar(l.nome)}, em Araras?</h1><p>Leia os documentos, quem apresentou cada proposta e as datas.</p></header>${periodo}<p>${oficial(n(lista.length),executar(`fonteLocal(${JSON.stringify(l.nome)})`))} propostas citam este local. A identificação é automática a partir dos textos oficiais e pode exigir correção.</p><p class="notice">${escapar(executar('avisoRepeticao'))}</p>${repeticoes}<h2>Propostas que citam este local</h2>`;
  listarPropostas(lista,base,`Pedidos e propostas para ${l.nome}, em Araras`,`Propostas que citam ${l.nome}, em Araras: autores, datas, fontes oficiais e pedidos recorrentes.`,cabecalho,{ativo:'bairros'});
}
const categorias = Object.entries(grupos).map(([id,[titulo,descricao]])=>`<li><a href="${grupoUrl(id)}">${escapar(titulo)}</a><p>${escapar(descricao)}</p></li>`).join('');
adicionar('/propostas/','Propostas dos vereadores de Araras, por assunto | Radar Araras','Leia pedidos de melhoria, perguntas e cobranças, homenagens e propostas de lei dos vereadores de Araras.',`<header class="page-intro"><h1>Homenagem ou trabalho?</h1><p>Abra um grupo e leia proposta por proposta.</p></header>${periodo}<ul class="seo-links">${categorias}</ul><p><a href="/fontes/">Entenda a regra aplicada a todos os vereadores</a>.</p>`,{rotas:['propostas']});
for (const [id,[titulo,descricao]] of Object.entries(grupos)) {
  const lista = territorio.pedidos.filter(p=>p.grupo===id);
  listarPropostas(lista,grupoUrl(id),`${titulo} na Câmara de Araras`,`${titulo} apresentados pelos vereadores de Araras, com autoria, data e fonte oficial.`,`<a class="back" href="/propostas/">Todos os grupos</a><header class="page-intro"><h1>${escapar(titulo)}</h1><p>${escapar(descricao)}</p></header>${periodo}<p>${oficial(n(lista.length),fontePropostas)} propostas. Cada documento conta uma vez, mesmo com mais de um autor.</p>`);
}
const guias = [
  ['indicacao-requerimento-projeto-de-lei','Indicação, requerimento e projeto de lei: o que muda?',`<p>Para acompanhar a Câmara de Araras, você pode começar pelo objetivo do documento e depois abrir a fonte oficial para conferir os detalhes.</p><h2>Indicação: um pedido de providência</h2><p>É usada para sugerir uma medida, como manutenção ou melhoria de um serviço. A apresentação do pedido não comprova que a Prefeitura realizou a providência.</p><h2>Requerimento: um pedido formal à Câmara ou a uma autoridade</h2><p>Pode pedir informações, providências ou uma decisão de procedimento. Leia o assunto: o nome do documento, sozinho, não explica toda a sua finalidade.</p><h2>Projeto de lei: uma proposta de regra</h2><p>É uma proposta em tramitação. Apresentar um projeto não significa que ele já virou lei. Consulte a ficha oficial para acompanhar a tramitação e o resultado.</p><h2>Como o Radar organiza esses documentos</h2><p>A classificação considera o tipo e o texto oficial. Por isso um projeto que dá nome a uma rua pode entrar em homenagens, e um pedido de informações pode entrar em perguntas e cobranças. A mesma regra é aplicada a todos os autores.</p>`],
  ['como-conferir-presenca-e-votos','Como conferir a presença e os votos dos vereadores de Araras',`<p>Abra a página de um vereador e escolha Presença ou Votos. Cada registro leva à sessão publicada pela Câmara.</p><h2>Presença depende do registro da chamada</h2><p>A chamada eletrônica registra um momento da sessão. A ata pode listar os presentes na abertura. Esses momentos podem ser diferentes. O Radar mostra as divergências encontradas e não transforma falta de registro em ausência.</p><h2>Nem toda votação tem votos individuais publicados</h2><p>Confira o tipo de votação e os registros disponíveis. Voto secreto não permite atribuir uma escolha individual. Situações como “Não vota”, “Ausente” e “Abstenção” têm significados diferentes e são mantidas conforme a fonte.</p><p><a href="/sessoes/">Abrir as sessões</a> · <a href="/vereadores/">Escolher um vereador</a>.</p>`],
  ['como-entender-gastos-da-camara','Como entender salários, contratos e viagens da Câmara de Araras',`<p>Os três quadros da abertura separam os pagamentos registrados aos vereadores e suplentes, os demais gastos de funcionamento e as despesas identificadas como viagem.</p><h2>Valor contratado não é valor pago</h2><p>Um contrato informa um compromisso e suas condições. Empenho reserva recursos, liquidação reconhece uma obrigação e pagamento registra o desembolso. Somar essas etapas como se fossem gastos diferentes duplica valores.</p><h2>O contador de salários é uma estimativa</h2><p>O movimento por segundo usa a média dos pagamentos coletados. O valor efetivamente registrado aparece identificado abaixo do contador. Essa projeção não é um novo lançamento da Câmara.</p><h2>Cada fonte tem seu período</h2><p>O arquivo mensal do TCE-SP e a execução detalhada da Câmara podem ter datas e recortes diferentes. Consulte a fonte indicada no quadro e o período dos registros.</p><p><a href="/contas-da-camara/">Consultar as contas</a>.</p>`]
];
adicionar('/entenda/','Entenda a Câmara Municipal de Araras | Radar Araras','Guias simples para entender propostas, presença, votos, salários, contratos e viagens da Câmara de Araras.',`<header class="page-intro"><h1>Entenda a Câmara</h1><p>Informação pública em linguagem simples.</p></header><ul class="seo-links">${guias.map(([url,titulo])=>`<li><a href="/entenda/${url}/">${titulo}</a></li>`).join('')}</ul>`);
for (const [url,titulo,texto] of guias) adicionar(`/entenda/${url}/`,`${titulo} | Radar Araras`,titulo+' Veja como consultar os registros oficiais no Radar Araras.',`<article class="seo-texto"><a class="back" href="/entenda/">Todos os guias</a><header class="page-intro"><h1>${titulo}</h1><p>Explicação editorial do Radar Araras.</p></header>${texto}<h2>Confira nas fontes oficiais</h2><p>${oficial('Regimento Interno da Câmara de Araras','https://legislacaodigital.com.br/Araras-SP/Resolucoes/1-2015')} · ${oficial('Lei Orgânica de Araras','https://legislacaodigital.com.br/Araras-SP/LeisOrganicas/0')} · ${oficial('Consulta de documentos no Siscam',fontePropostas)}.</p><p><a href="/fontes/">Critérios e limites dos dados</a>.</p></article>`,{editorial:true});
const recentes = territorio.pedidos.slice(0,12);
contexto.recentesSEO = recentes;
adicionar('/boletim/','Registros recentes da Câmara de Araras | Radar Araras','Veja as propostas mais recentes e a última sessão nos dados oficiais coletados pelo Radar Araras.',`<header class="page-intro"><h1>Registros recentes da Câmara de Araras</h1><p>Resumo automático dos documentos da última base aprovada, sem avaliação política.</p></header>${periodo}<h2>Última sessão nos dados</h2><p><a href="/sessoes/${sessoes[0].id}/">${escapar(sessoes[0].titulo)}</a> · ${oficial(data(sessoes[0].data),sessoes[0].url)}</p><h2>Propostas mais recentes</h2><ul class="radar-pedidos">${executar('recentesSEO.map(pedidoNoRadar).join("")')}</ul><p><a href="/propostas/">Ler todos os grupos</a>.</p><p>Atualizar a coleta não significa que a Câmara publicou novos documentos. Os registros podem ser divulgados com atraso.</p>`);
adicionar('/contato/','Contato e correções de dados | Radar Araras','Entre em contato com Rafael Zaniboni, idealizador do Radar Araras, para informar erros e sugerir melhorias.',`<article class="seo-texto"><header class="page-intro"><h1>Contato e correções</h1></header><p>O Radar Araras é uma iniciativa independente idealizada por Rafael Zaniboni.</p><p>Encontrou uma divergência? Envie o endereço da página e o link do registro oficial para que possamos conferir.</p><p><a href="https://wa.me/5519997538385" target="_blank" rel="noopener">Falar com Rafael Zaniboni pelo WhatsApp</a></p><p>O contato abre um serviço externo. Informações enviadas nessa conversa são recebidas pelo responsável pelo projeto.</p><p><a href="/o-idealizador/">Conheça o idealizador</a> · <a href="/fontes/">Fontes e critérios</a>.</p></article>`);
adicionar('/privacidade/','Privacidade e uso de cookies | Radar Araras','Entenda os serviços de medição e publicidade, as preferências de cookies e os canais de contato do Radar Araras.',`<article class="seo-texto"><header class="page-intro"><h1>Privacidade e uso de cookies</h1></header><p>O Radar Araras é uma iniciativa independente de Rafael Zaniboni. Esta página explica o funcionamento dos serviços utilizados no site.</p><h2>Consulta dos dados públicos</h2><p>Você pode consultar os dados sem criar conta. Os documentos dos vereadores e os registros financeiros vêm das fontes oficiais indicadas nas páginas. A identificação de bairros e ruas é automática e pode exigir correção.</p><h2>Google Analytics</h2><p>Quando você permite os serviços opcionais, usamos Google Analytics para medir visitas, páginas consultadas e origem dos acessos. O Google processa informações técnicas da conexão e do dispositivo. O site configura a medição sem recursos de personalização de anúncios e sem enviar os termos digitados na nossa busca.</p><h2>Google AdSense</h2><p>Quando permitido nas preferências, o código de publicidade do Google AdSense é carregado. O Google e seus parceiros podem usar cookies para publicidade e medição, inclusive considerando visitas anteriores a este e a outros sites, conforme as configurações e políticas desses serviços. A exibição depende da aprovação e disponibilidade do AdSense.</p><p>Consulte <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">como o Google usa informações dos sites parceiros</a>, a <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">política de privacidade do Google</a> e os <a href="https://myadcenter.google.com/" target="_blank" rel="noopener">controles de personalização de anúncios</a>.</p><h2>Consentimento na Europa, Reino Unido e Suíça</h2><p>Nessas regiões, a plataforma certificada de consentimento do Google apresenta opções para consentir, não consentir ou gerir as escolhas, com a lista de parceiros e finalidades. O Analytics aguarda os sinais de consentimento dessa plataforma antes de carregar. Se o Google não confirmar uma escolha válida ou que a regra não se aplica, a medição permanece bloqueada.</p><p>Quando disponível para sua região, use “Privacidade dos anúncios”, no rodapé, para rever ou retirar o consentimento junto ao Google. A escolha local de continuar sem serviços opcionais mantém publicidade e Analytics bloqueados no site.</p><p>Você também pode consultar as <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener">opções de publicidade de fornecedores participantes</a>.</p><h2>Suas escolhas</h2><p>A preferência fica guardada no armazenamento local do navegador. Os serviços opcionais não são carregados pelo site antes da sua permissão. Você pode revisar sua escolha em “Preferências de privacidade”, no rodapé. Ao retirar a permissão, a página é recarregada; cookies anteriores também podem ser apagados nas configurações do navegador.</p><h2>Hospedagem e links externos</h2><p>A Hostinger entrega os arquivos do site e pode processar registros técnicos de acesso para operar e proteger a hospedagem. Fontes, retratos e links externos podem estabelecer conexões com seus respectivos provedores. Ao abrir WhatsApp e redes sociais, aplicam-se também as políticas desses serviços.</p><h2>Contato</h2><p>Para dúvidas de privacidade ou correções, <a href="/contato/">entre em contato com o responsável pelo projeto</a>.</p></article>`,{editorial:true});
adicionar('/404.html','Página não encontrada | Radar Araras','O endereço solicitado não corresponde a uma página do Radar Araras.',`<header class="page-intro"><h1>Página não encontrada</h1><p>O endereço pode ter mudado. <a href="/">Voltar ao início</a> ou <a href="/bairros-e-ruas/">buscar um bairro ou rua</a>.</p></header>`,{noindex:true});

// Reaproveita o mesmo conteúdo HTML para moradores e buscadores, sem renderização por user-agent.
const template = fs.readFileSync(path.join(raiz,'templates/base.html'),'utf8');
// Reutiliza as funções puras já testadas; a abertura não precisa carregar a base legislativa inteira.
const funcoesAbertura = executar('[tempoDesdeConferencia,estimarSalarios].map(fn=>fn.toString()).join("\\n")');
gravar('abertura.js',`'use strict';\n(() => {\n${funcoesAbertura}\n
  const dados = JSON.parse(document.querySelector('#dados-abertura').textContent);
  const formato = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  let relogio;
  function contador() {
    if (document.documentElement.dataset.interativosProntos === '1') { clearInterval(relogio); return; }
    const alvo = document.querySelector('[data-contador-salarios]');
    const estimativa = estimarSalarios(dados);
    if (alvo && estimativa) {
      const valor = formato.format(estimativa.valor / 100);
      alvo.textContent = valor;
      alvo.setAttribute('aria-label','Salários desde a posse, estimativa em tempo real '+valor);
    }
  }
  contador();
  relogio = setInterval(contador,1000);
  const selo = document.querySelector('[data-status-coleta]');
  const texto = selo?.querySelector('[data-status-texto]');
  fetch('/atualizacao.json?v='+document.documentElement.dataset.coleta,{cache:'no-store'})
    .then(r=>{if(!r.ok)throw Error();return r.json();}).then(r=>{
      if (!texto) return;
      if (r.aprovado!==true || r.fim!==dados.fim || r.verificacoes?.revisao!==document.documentElement.dataset.coleta) {
        texto.textContent='nova conferência disponível · atualize a página'; return;
      }
      let intervalo;
      function atualizar() {
        if (document.documentElement.dataset.interativosProntos==='1') {clearInterval(intervalo);return;}
        const tempo=tempoDesdeConferencia(r.concluidoEm);
        texto.textContent=tempo?'dados conferidos '+tempo:'confira a última atualização em Fontes';
        if(tempo) {
          texto.dateTime=r.concluidoEm;
          selo.title='Conferência concluída em '+new Intl.DateTimeFormat('pt-BR',{dateStyle:'long',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(r.concluidoEm))+'. A coleta é diária; consulte as fontes e os limites.';
        }
      }
      atualizar(); intervalo=setInterval(atualizar,60000);
    }).catch(()=>{if(texto)texto.textContent='confira a última atualização em Fontes';});
})();\n`);
const marca = { '@type':'Organization','@id':origem+'/#organizacao',name:config.nome,url:origem+'/',description:'Iniciativa independente de transparência e fiscalização cidadã em Araras/SP.',logo:origem+'/logo-radar-araras.png',founder:{'@type':'Person',name:config.editor}};
function converter(html) {
  return html.replace(/<img\b[^>]*src="\/?(logo-radar-araras|rafael-zaniboni)\.png"[^>]*>/g,(tag,nome)=>{
    const variantes=imagens?.[nome]?.variantes;
    if (!variantes?.length) return tag;
    const principal=variantes.at(-1);
    const hero=tag.includes('alt="Radar Araras"');
    const tamanhos=nome==='logo-radar-araras'?(hero?'(max-width: 760px) 86vw, 460px':'150px'):'(max-width: 760px) 90vw, 340px';
    return tag.replace(/src="[^"]*"/,`src="/${principal.arquivo}" srcset="${variantes.map(v=>`/${v.arquivo} ${v.largura}w`).join(', ')}" sizes="${tamanhos}"${hero?' fetchpriority="high"':''}`);
  }).replace(/<details data-historico-id="(\d+)"><summary>Ver versões registradas<\/summary><div data-versoes><p>Abra para consultar o histórico\.<\/p><\/div><\/details>/g,(original,id)=>{
    const item = historicoCompleto.documentos[id];
    if (!item) return original;
    return `<details data-historico-id="${id}" data-carregado="sim"><summary>Ver versões registradas</summary><div data-versoes><p>Estas são cópias dos dados da listagem oficial coletados pelo Radar. Não substituem o arquivo original nem confirmam retirada ou validade da proposta.</p><ol>${[...item.versoes].reverse().map(v=>`<li><p><strong>Versão observada em ${escapar(data(v.observadaEm))}</strong></p><p>${oficial(v.dados.titulo,v.dados.url)}</p><p>Data publicada: ${escapar(data(v.dados.data))}. Tipo: ${escapar(v.dados.tipo)}.</p><p>${escapar(v.dados.assunto)}</p><p>Autoria: ${v.dados.autores.map(id=>escapar(mapaPessoas.get(id)?.nomePublico||`Identificador oficial ${id}`)).join(', ')}.</p></li>`).join('')}</ol></div></details>`;
  }).replace(/href="#([^"\s]*)"/g,(todo,rota)=>rotas[rota]?`href="${rotas[rota]}"`:todo)
    .replace(/\b(src|href)="(?!https?:|\/|#|data:)([^"\s]+\.(?:png|webp|jpg|svg|css|js|json)(?:\?[^"\s]*)?)"/g,'$1="/$2"');
}
const conteudoAnterior = new Map((anterior?.paginas||[]).map(p=>[p.url,p]));
for (const pagina of paginas) {
  let corpo = converter(pagina.corpo);
  const caminho = pagina.url==='/'?'index.html':pagina.url==='/404.html'?'404.html':pagina.url.slice(1)+'index.html';
  const conteudoSignificativo = corpo.replace(/<(p|span)\b[^>]*data-periodo-coleta[^>]*>[\s\S]*?<\/\1>/g,'')
    .replace(/([?&](?:amp;)?dataFinal=)[^&"\s]+/g,'$1recorte')
    .replace(/([?&](?:amp;)?v=)[a-f0-9]{20}/g,'$1revisao');
  const assinatura = hash(conteudoSignificativo+pagina.titulo+pagina.descricao);
  pagina.assinatura = assinatura;
  pagina.arquivo = caminho;
  // Não troca a data só por uma nova execução ou pela passagem do contador.
  pagina.modificadoEm = conteudoAnterior.get(pagina.url)?.assinatura===assinatura ? conteudoAnterior.get(pagina.url).modificadoEm : new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const tituloSemMarca = pagina.titulo.replace(/ \| Radar Araras$/,'');
  const trilha = pagina.url==='/'?'':`<nav class="seo-caminho" aria-label="Caminho da página"><span><a href="/">Início</a></span>${pagina.ativo&&rotas[pagina.ativo]&&rotas[pagina.ativo]!==pagina.url?`<span><a href="${rotas[pagina.ativo]}">${escapar({vereadores:'Vereadores',bairros:'Bairros e ruas',contas:'Contas da Câmara',sessoes:'Sessões'}[pagina.ativo]||'Consulta')}</a></span>`:''}<span aria-current="page">${escapar(tituloSemMarca)}</span></nav>`;
  const dados = [marca,{'@type':'WebSite','@id':origem+'/#site',url:origem+'/',name:config.nome,inLanguage:'pt-BR',publisher:{'@id':origem+'/#organizacao'}},{'@type':'WebPage',url:origem+pagina.url,name:pagina.titulo,description:pagina.descricao,inLanguage:'pt-BR',isPartOf:{'@id':origem+'/#site'}}];
  if (pagina.url!=='/') dados.push({'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Início',item:origem+'/'},{'@type':'ListItem',position:2,name:tituloSemMarca,item:origem+pagina.url}]});
  if (pagina.pessoa) dados[2].about={'@type':'Person',name:pagina.pessoa.nomePublico,...(pagina.pessoa.perfil?{sameAs:pagina.pessoa.perfil}:{})};
  if (pagina.url==='/fontes/') dados.push({'@type':'Dataset',name:'Propostas dos vereadores de Araras e locais citados desde 2025',description:'Base organizada pelo Radar Araras a partir das listagens oficiais da Câmara, com identificação automática de lugares, autoria e classificação por assunto. Limites e critérios descritos nesta página.',url:origem+'/fontes/',creator:{'@id':origem+'/#organizacao'},temporalCoverage:'2025-01-01/'+fim,spatialCoverage:{'@type':'Place',name:'Araras, São Paulo, Brasil'},isBasedOn:fontePropostas,distribution:{'@type':'DataDownload',contentUrl:origem+'/territorio.json',encodingFormat:'application/json'}});
  const metadata = `<link rel="canonical" href="${origem+pagina.url}"><meta name="robots" content="${pagina.noindex?'noindex,follow':'index,follow,max-image-preview:large'}"><meta property="og:type" content="website"><meta property="og:locale" content="pt_BR"><meta property="og:site_name" content="Radar Araras"><meta property="og:title" content="${escapar(pagina.titulo)}"><meta property="og:description" content="${escapar(pagina.descricao)}"><meta property="og:url" content="${origem+pagina.url}"><meta property="og:image" content="${origem}/logo-radar-araras.png"><meta property="og:image:alt" content="Radar Araras"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapar(pagina.titulo)}"><meta name="twitter:description" content="${escapar(pagina.descricao)}"><meta name="twitter:image" content="${origem}/logo-radar-araras.png"><meta name="google-adsense-account" content="${config.adsense}"><script type="application/ld+json">${jsonSeguro({'@context':'https://schema.org','@graph':dados})}</script>`;
  let html = template.replace(/<html[^>]*>/,`<html lang="pt-BR" data-coleta="${revisao}" data-seo="1" data-interativo="${pagina.interativo?'1':'0'}" data-analytics="${escapar(config.analytics)}">`)
    .replace(/<title>[^<]*<\/title>/,`<title>${escapar(pagina.titulo)}</title>`)
    .replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${escapar(pagina.descricao)}">`)
    .replace('<div id="painel"></div>',`<div id="painel">${trilha}${corpo}</div>`)
    .replace(/<noscript>[\s\S]*?<\/noscript>/,'<noscript><style>.entry[hidden]{display:flex!important}.more{display:none!important}</style><p class="section-note">Os registros abaixo podem ser lidos sem JavaScript. A busca interativa e os contadores precisam dele.</p></noscript>')
    .replace('<script async src="https://pagead2.', '<script type="text/plain" data-publicidade async src="https://pagead2.')
    .replace('</head>',`${metadata}<link rel="stylesheet" href="/seo.css?v=${revisao}"><script src="/rotas.js?v=${revisao}" defer></script><script src="/navegacao.js?v=${revisao}" defer></script><script src="/privacidade.js?v=${revisao}" defer></script></head>`)
    .replace('<div class="footer-creditos">','<div class="footer-privacidade"><a href="/entenda/">Entenda a Câmara</a><a href="/contato/">Contato</a><a href="/privacidade/">Privacidade</a><button type="button" data-preferencias>Preferências de privacidade</button><button type="button" data-preferencias-google hidden style="display:none">Privacidade dos anúncios</button></div><div class="footer-creditos">');
  html=html.replace('</head>',`<link rel="icon" href="/favicon.ico?v=${revisaoFavicon}" sizes="16x16 32x32 48x48 64x64"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=${revisaoFavicon}"><link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png?v=${revisaoFavicon}"><link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png?v=${revisaoFavicon}"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=${revisaoFavicon}"></head>`);
  if (!pagina.interativo || pagina.url==='/') html=html.replace(/\s*<script src="(?:legislativo|auditoria-presencas|financas|pagamentos|propostas|historico-documentos|territorio-resumo|radar|app)\.js[^>]*><\/script>/g,'');
  if (pagina.url==='/') {
    const dadosAbertura = {inicio:pagamentos.inicio,fim:pagamentos.fim,consultadoEm:pagamentos.consultadoEm,totais:{vereadores:pagamentos.totais.vereadores}};
    const scriptsInterativos = ['legislativo','auditoria-presencas','financas','pagamentos','propostas','historico-documentos','territorio-resumo','radar','app'].map(nome=>'/'+nome+'.js?v='+revisao);
    html=html.replace('</head>',`<script id="dados-abertura" type="application/json">${jsonSeguro(dadosAbertura)}</script><script id="scripts-interativos" type="application/json">${jsonSeguro(scriptsInterativos)}</script><script src="/abertura.js?v=${revisao}" defer></script><script src="/iniciar-interativos.js?v=${revisao}" defer></script></head>`);
  }
  html=converter(html).replace(/(src="\/(?:app|radar|legislativo|auditoria-presencas|financas|pagamentos|propostas|historico-documentos|territorio-resumo)\.js)(?:\?[^"\s]*)?"/g,`$1?v=${revisao}"`).replace(/(href="\/(?:estilos|radar)\.css)(?:\?[^"\s]*)?"/g,`$1?v=${revisao}"`);
  if (pagina.ativo) html=html.replace(new RegExp(`data-page="${pagina.ativo}"`),'$& aria-current="page"');
  gravar(caminho,html.replace(/[\t ]+$/gm,''));
}
const manifest = {versao:1,origem,revisao,fim,paginas:paginas.map(({url,titulo,arquivo,assinatura,modificadoEm,noindex})=>({url,titulo,arquivo,assinatura,modificadoEm,noindex:!!noindex}))};
const atuais = new Set(manifest.paginas.map(p=>p.arquivo));
for (const p of anterior?.paginas || []) {
  if (atuais.has(p.arquivo)) continue;
  const alvo=path.resolve(dist,p.arquivo);
  if (!alvo.startsWith(dist+path.sep)||!p.arquivo.endsWith('/index.html')) throw Error('Arquivo gerenciado inválido.');
  if (fs.existsSync(alvo)) fs.unlinkSync(alvo);
}
gravar('rotas.js',`globalThis.ARARAS_ROTAS = ${jsonSeguro(rotas)};\n`);
gravar('seo-manifest.json',JSON.stringify(manifest,null,2)+'\n');
gravar('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+manifest.paginas.filter(p=>!p.noindex).map(p=>`<url><loc>${escapar(origem+p.url)}</loc><lastmod>${p.modificadoEm}</lastmod></url>`).join('')+'</urlset>\n');
gravar('robots.txt',`User-agent: *\nAllow: /\nSitemap: ${origem}/sitemap.xml\n`);
gravar('ads.txt','google.com, pub-2804798076254345, DIRECT, f08c47fec0942fa0\n');
console.log(`SEO gerado: ${paginas.filter(p=>!p.noindex).length} páginas indexáveis, ${pessoas.length} perfis, ${locais.length} locais; base ${fim}; revisão ${revisao}.`);
