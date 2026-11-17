import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
const tipos = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

async function lerArquivos(pasta) {
  const resultado = [];
  for (const entry of await readdir(pasta, { withFileTypes: true })) {
    if (pasta === dist && ['server', '.openai'].includes(entry.name)) continue;
    const caminho = join(pasta, entry.name);
    if (entry.isDirectory()) resultado.push(...await lerArquivos(caminho));
    else if (entry.isFile() && tipos[extname(entry.name)]) {
      const chave = '/' + relative(dist, caminho).split('\\').join('/');
      const compactado = gzipSync(await readFile(caminho), { level: 9 }).toString('base64');
      resultado.push([chave, [tipos[extname(entry.name)], compactado]]);
    } else throw new Error(`Arquivo inesperado em dist ${entry.name}`);
  }
  return resultado;
}

const assets = Object.fromEntries(await lerArquivos(dist));
const arquivos = ['pagamentos.mjs', 'servidor-pagamentos.mjs'];
const fonte = await Promise.all(arquivos.map(nome => readFile(join(raiz, 'scripts', nome), 'utf8')));
const destino = join(dist, 'server');
await mkdir(destino, { recursive: true });
await writeFile(join(destino, 'index.js'), `const arquivosEstaticos = ${JSON.stringify(assets)};\n${fonte.join('\n')}`);
console.log(`${Object.keys(assets).length} arquivos do site incluídos no servidor.`);
