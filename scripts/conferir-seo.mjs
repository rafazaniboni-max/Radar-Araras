/** Verificação de publicação: URLs, fontes, HTML, paginação, mapa e dados estruturados. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const raiz=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const i=process.argv.indexOf('--dist');
const dist=path.resolve(i>=0?process.argv[i+1]:path.join(raiz,'dist'));
const ler=p=>fs.readFileSync(path.join(dist,p),'utf8');
const manifesto=JSON.parse(ler('seo-manifest.json'));
const territorio=JSON.parse(ler('territorio.json'));
const nomes=new Set(), urls=new Set(manifesto.paginas.map(p=>p.url));
const sitemap=ler('sitemap.xml');
assert.equal(urls.size,manifesto.paginas.length,'URLs duplicadas');
let fontes=0;
for (const p of manifesto.paginas) {
  assert(!nomes.has(p.titulo),'Título duplicado: '+p.titulo); nomes.add(p.titulo);
  const html=ler(p.arquivo);
  assert.equal((html.match(/<h1\b/g)||[]).length,1,'Uma página precisa ter um título principal: '+p.url);
  assert(html.includes(`rel="canonical" href="${manifesto.origem+p.url}"`),'Canonical incorreto: '+p.url);
  assert(html.includes('property="og:url"'),'Metadados sociais ausentes');
  assert(html.includes('rel="icon" href="/favicon.ico?v='),'Favicon ausente: '+p.url);
  assert(html.includes('rel="apple-touch-icon"'),'Ícone para celular ausente');
  const dados=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]||'null');
  assert.equal(dados?.['@context'],'https://schema.org');
  assert(!html.includes('<div id="painel"></div>'),'Conteúdo vazio');
  if (p.url==='/') {
    assert(!/<script src="\/legislativo\.js/.test(html),'A abertura carrega dados pesados antes do uso');
    assert(html.includes('data-contador-salarios'),'Contador ausente na abertura');
    assert(html.includes('/abertura.js?v='),'Contador independente ausente');
  }
  assert(!html.includes('http://127.0.0.1'),'Endereço local publicado');
  assert(!/<a[^>]*href="#(?:vereador|sessao|contas|fontes|idealizador)(?:\/|")/.test(html),'Link de conteúdo ainda depende de hash: '+p.url);
  for (const [,url] of html.matchAll(/href="(\/[^"?#]*)(?:[?#][^"]*)?"/g)) {
    if (url.endsWith('/')||url.endsWith('.html')) assert(urls.has(url),'Link sem página: '+url+' em '+p.url);
    else assert(fs.existsSync(path.join(dist,url.slice(1))),'Arquivo ausente: '+url);
  }
  for (const [,url] of html.matchAll(/src="(\/[^"?#]*)(?:[?#][^"]*)?"/g)) {
    assert(fs.existsSync(path.join(dist,url.slice(1))),'Recurso local ausente: '+url);
  }
  const anuncios=html.match(/<script\b[^>]*src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^>]*>/g)||[];
  assert.equal(anuncios.length,1,'AdSense ausente ou duplicado');
  assert(anuncios[0].includes('type="text/plain"')&&anuncios[0].includes('data-publicidade'),'Publicidade deve respeitar preferências');
  assert.equal(sitemap.includes(`<loc>${manifesto.origem+p.url}</loc>`),!p.noindex,'Mapa divergente: '+p.url);
  fontes += (html.match(/https:\/\/araras\.siscam\.com\.br\/Documentos\/Documento\//g)||[]).length;
}
assert(fontes>=territorio.pedidos.length,'Propostas não foram expostas no HTML');
assert(ler('robots.txt').includes('Sitemap: '+manifesto.origem+'/sitemap.xml'));
assert.equal(ler('ads.txt').trim(),'google.com, pub-2804798076254345, DIRECT, f08c47fec0942fa0');
const perfis=manifesto.paginas.filter(p=>/^\/vereadores\/[^/]+\/$/.test(p.url));
const legislativo=ler('legislativo.js');
const base=JSON.parse(legislativo.slice(legislativo.indexOf('=')+1).trim().replace(/;$/,''));
assert.equal(perfis.length,base.vereadores.length,'Há perfil da base oficial sem página');
console.log(`SEO conferido: ${manifesto.paginas.filter(p=>!p.noindex).length} páginas indexáveis, ${perfis.length} perfis, ${fontes} links de documentos, títulos únicos e sitemap consistente.`);
