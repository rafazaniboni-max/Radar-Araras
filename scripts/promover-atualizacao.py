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
for arquivo in (destino / 'propostas').glob('*.json'):
    arquivo.unlink()
shutil.copytree(origem, destino, dirs_exist_ok=True)
print('Nova referência validada guardada em dist.')
