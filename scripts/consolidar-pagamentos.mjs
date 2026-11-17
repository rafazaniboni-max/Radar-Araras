import { writeFile } from 'node:fs/promises';
import { consultarPagamentos } from './pagamentos.mjs';

const resumo = await consultarPagamentos();
const destino = new URL('../dist/pagamentos.js', import.meta.url);
await writeFile(destino, `globalThis.ARARAS_PAGAMENTOS = ${JSON.stringify(resumo)};\n`);
console.log(`Dados consultados em ${resumo.fim}. Último pagamento no arquivo ${resumo.ultimaData}.`);
