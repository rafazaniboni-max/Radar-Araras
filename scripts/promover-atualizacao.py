"""Guarda os dados de uma publicação aprovada como referência para a próxima coleta."""

import json
from pathlib import Path
import shutil

RAIZ = Path(__file__).resolve().parents[1]
trabalho = RAIZ / '.build' / 'atualizacao'
relatorio = json.loads((trabalho / 'relatorio.json').read_text(encoding='utf-8'))
if relatorio.get('aprovado') is not True:
    raise SystemExit('A referência não pode receber uma coleta reprovada.')
origem = trabalho / 'dist'
destino = RAIZ / 'dist'
manifesto_anterior = destino / 'seo-manifest.json'
manifesto_novo = origem / 'seo-manifest.json'
if manifesto_anterior.exists() and manifesto_novo.exists():
    antigos = json.loads(manifesto_anterior.read_text(encoding='utf-8'))['paginas']
    novos = {p['arquivo'] for p in json.loads(manifesto_novo.read_text(encoding='utf-8'))['paginas']}
    for pagina in antigos:
        relativo = pagina['arquivo']
        if relativo in novos:
            continue
        alvo = (destino / relativo).resolve()
        if not alvo.is_relative_to(destino.resolve()) or not relativo.endswith('/index.html'):
            raise ValueError('Caminho inválido no manifesto de páginas antigas.')
        if alvo.is_file():
            alvo.unlink()
for arquivo in (destino / 'propostas').glob('*.json'):
    arquivo.unlink()
shutil.copytree(origem, destino, dirs_exist_ok=True)
print('Nova referência validada guardada em dist.')
