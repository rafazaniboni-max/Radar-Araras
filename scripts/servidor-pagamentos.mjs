const caminhoDados = '/api/pagamentos';
const caminhoAtualizacao = '/api/pagamentos/atualizar';
const chaveDados = 'pagamentos-consolidados.json';

function json(dados, status = 200) {
  return Response.json(dados, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function obterResumo(bucket) {
  const arquivo = await bucket.get(chaveDados);
  return arquivo?.json() ?? null;
}

async function atualizar(env) {
  const bucket = env.BUCKET;
  if (!bucket) return json({ erro: 'O armazenamento do quadro está indisponível.' }, 503);
  const agora = new Date();
  let etapa = 'ler o resumo anterior';
  try {
    const existente = await obterResumo(bucket);
    if (Number.isSafeInteger(existente?.totais?.viagens) && diaEmAraras(new Date(existente.consultadoEm)) === diaEmAraras(agora)) {
      return json({ atualizado: false, consultadoEm: existente.consultadoEm, ultimaData: existente.ultimaData });
    }
    etapa = 'consultar a Câmara';
    const resumo = await consultarPagamentos(agora);
    etapa = 'gravar o resumo';
    const maisRecente = await obterResumo(bucket);
    if (maisRecente?.consultadoEm > resumo.consultadoEm) {
      return json({ atualizado: false, consultadoEm: maisRecente.consultadoEm, ultimaData: maisRecente.ultimaData });
    }
    if (maisRecente?.ultimaData && resumo.ultimaData < maisRecente.ultimaData) {
      throw new Error('O arquivo oficial retornou uma data de pagamento anterior à já exibida.');
    }
    await bucket.put(chaveDados, JSON.stringify(resumo), { httpMetadata: { contentType: 'application/json' } });
    return json({ atualizado: true, consultadoEm: resumo.consultadoEm, ultimaData: resumo.ultimaData });
  } catch (erro) {
    const detalhe = String(erro.message).replace(/https?:\/\/\S+/g, '[URL]').slice(0, 200);
    console.error('Falha na atualização dos pagamentos', etapa, erro.name, detalhe);
    return json({ erro: 'A consulta oficial ficou indisponível ou o arquivo retornou dados fora do formato esperado.' }, 503);
  }
}

function arquivoEstatico(pathname, metodo) {
  const chave = pathname === '/' ? '/index.html' : pathname;
  if (!Object.hasOwn(arquivosEstaticos, chave)) return new Response('Página não encontrada.', { status: 404 });
  const [tipo, conteudo] = arquivosEstaticos[chave];
  const corpo = metodo === 'HEAD' ? null : new Blob([Uint8Array.from(atob(conteudo), ch => ch.charCodeAt(0))])
    .stream().pipeThrough(new DecompressionStream('gzip'));
  const cache = tipo.startsWith('text/html') ? 'no-cache' : 'private, max-age=300';
  return new Response(corpo, { headers: { 'Content-Type': tipo, 'Cache-Control': cache } });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === caminhoAtualizacao && request.method === 'POST') {
      // Sites autentica o proprietário e o acesso de serviço antes de encaminhar a requisição.
      return atualizar(env);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    if (pathname === caminhoDados) {
      const resumo = env.BUCKET ? await obterResumo(env.BUCKET).catch(() => null) : null;
      return resumo ? json(resumo) : new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }
    return arquivoEstatico(pathname, request.method);
  },
};
