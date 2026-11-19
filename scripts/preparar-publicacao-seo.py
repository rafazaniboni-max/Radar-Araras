"""Atualiza a apresentação e o SEO sem declarar uma nova coleta das fontes oficiais."""
from datetime import datetime
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
from zoneinfo import ZoneInfo

RAIZ = Path(__file__).resolve().parents[1]


def modulo(nome, arquivo):
    spec = importlib.util.spec_from_file_location(nome, RAIZ / 'scripts' / arquivo)
    resultado = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(resultado)
    return resultado


def main():
    base = RAIZ / 'dist'
    trabalho = RAIZ / '.build' / 'atualizacao'
    destino = trabalho / 'dist'
    relatorio = json.loads((base / 'atualizacao.json').read_text(encoding='utf-8'))
    if relatorio.get('aprovado') is not True:
        raise ValueError('A versão de referência não contém uma coleta aprovada.')
    shutil.copytree(base, destino, dirs_exist_ok=True, ignore=shutil.ignore_patterns('server'))
    subprocess.run([sys.executable, 'scripts/otimizar-imagens.py', '--dist', str(destino)], cwd=RAIZ, check=True)
    subprocess.run([sys.executable, 'scripts/gerar-favicons.py', '--dist', str(destino)], cwd=RAIZ, check=True)
    coletor = modulo('coletor_publicacao_seo', 'atualizar-site.py')
    coletor.versionar_dados(destino)
    subprocess.run(['node', 'scripts/gerar-seo.mjs', '--dist', str(destino)], cwd=RAIZ, check=True)
    subprocess.run(['node', 'scripts/conferir-seo.mjs', '--dist', str(destino)], cwd=RAIZ, check=True)
    validacao = modulo('validacao_publicacao_seo', 'validar-atualizacao.py')
    relatorio['verificacoes'] = validacao.validar(base, destino, relatorio['fim'])
    relatorio['siteAtualizadoEm'] = datetime.now(ZoneInfo('America/Sao_Paulo')).isoformat()
    relatorio['tipoPublicacao'] = 'apresentacao-e-seo-sobre-coleta-aprovada'
    relatorio['referenciaPreservada'] = True
    # concluidoEm continua sendo a data real da coleta, usada no selo da abertura.
    texto = json.dumps(relatorio, ensure_ascii=False, indent=2)
    (destino / 'atualizacao.json').write_text(texto, encoding='utf-8')
    (trabalho / 'relatorio.json').write_text(texto, encoding='utf-8')
    print(f"Apresentação preparada; data da coleta preservada: {relatorio['concluidoEm']}.")


if __name__ == '__main__':
    main()
