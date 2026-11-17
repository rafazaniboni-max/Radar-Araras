"""Coleta todas as fontes oficiais e prepara uma versão candidata, sem publicar."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from hashlib import sha256
from io import BytesIO
import json
from math import ceil
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from lxml import html
from pypdf import PdfReader

from importlib.util import module_from_spec, spec_from_file_location

RAIZ = Path(__file__).resolve().parents[1]


def modulo(nome):
    spec = spec_from_file_location(nome.replace('-', '_'), RAIZ / 'scripts' / f'{nome}.py')
    resultado = module_from_spec(spec)
    spec.loader.exec_module(resultado)
    return resultado


coletor = modulo('coletar-legislativo')
propostas = modulo('ler-propostas-por-autor')
classificacao = modulo('classificar-propostas')
validacao = modulo('validar-atualizacao')


def executar(*comando):
    subprocess.run([str(p) for p in comando], cwd=RAIZ, check=True)


def baixar_bytes(url):
    for tentativa in range(3):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'RadarAraras/2.0 (dados oficiais)'}), timeout=35) as resposta:
                conteudo = resposta.read(50_000_001)
            if len(conteudo) > 50_000_000:
                raise ValueError('Arquivo oficial maior que o limite de leitura.')
            return conteudo
        except OSError:
            if tentativa == 2:
                raise
            time.sleep(2 * (tentativa + 1))


def coletar_propostas(pessoas, anteriores, cache, raw, fim):
    ids = sorted(set(anteriores) | {str(p['id']) for p in pessoas if p.get('id')})
    pasta = raw / 'propostas'
    pasta.mkdir(parents=True, exist_ok=True)

    def por_autor(identificador):
        url = f'{coletor.BASE}/Vereadores/Proposituras/{identificador}'
        arquivo = pasta / f'{identificador}.html'
        try:
            coletor.buscar(url, cache, timeout=120)
            arquivo.write_bytes((cache / f'{sha256(url.encode()).hexdigest()}.html').read_bytes())
            perfil = propostas.ler_perfil(arquivo, '2025-01-01', fim)
        except (RuntimeError, ValueError):
            def pesquisa(pagina):
                parametros = {'AutoriaId': identificador, 'Modulo': 8, 'Pesquisa': 'Avancada',
                              'AnoInicial': 2025, 'AnoFinal': fim[:4], 'Pagina': pagina}
                endereco = f'{coletor.BASE}/Documentos/Pesquisa/74?{urlencode(parametros)}'
                pagina_html = coletor.buscar(endereco, cache)
                destino = pasta / f'{identificador}-pesquisa-{pagina}.html'
                destino.write_bytes((cache / f'{sha256(endereco.encode()).hexdigest()}.html').read_bytes())
                return pagina_html, destino
            primeira, caminho = pesquisa(1)
            total = re.search(r'(\d+)\s+registro\(s\) encontrado\(s\)', primeira.text_content())
            if not total:
                raise ValueError(f'Pesquisa oficial sem total para o autor {identificador}.')
            caminhos = [caminho]
            for pagina in range(2, ceil(int(total[1]) / 15) + 1):
                caminhos.append(pesquisa(pagina)[1])
            perfil = propostas.ler_pesquisa(identificador, caminhos, '2025-01-01', fim)
        (pasta / f'{identificador}.json').write_text(json.dumps(perfil, ensure_ascii=False), encoding='utf-8')
        print(f'Autor {identificador}: {len(perfil["registros"])} propostas lidas.', flush=True)
        return len(perfil['registros'])

    with ThreadPoolExecutor(max_workers=4) as pool:
        contagens = list(pool.map(por_autor, ids))
    print(f'Propostas coletadas em {len(ids)} perfis. {sum(contagens)} registros de autoria.', flush=True)
    return pasta


def coletar_atas(sessoes, cache, raw):
    pasta = raw / 'atas'
    pasta.mkdir(parents=True, exist_ok=True)

    def por_sessao(sessao):
        pagina = coletor.buscar(sessao['url'], cache)
        anexos = []
        for link in pagina.xpath("//h4/a[starts-with(@href,'/Sessoes/Documento/')]"):
            if coletor.chave(coletor.texto(link)) != 'ata':
                continue
            item = link.getparent().getparent()
            pdfs = item.xpath(".//a[contains(@href,'arquivo?') and .//*[contains(@class,'file-pdf')]]")
            if not pdfs:
                detalhe = coletor.buscar(urljoin(coletor.BASE, link.get('href')), cache)
                pdfs = detalhe.xpath("//a[contains(@href,'arquivo?') and .//*[contains(@class,'file-pdf')]]")
            anexos.extend(pdfs)
        anexos.sort(key=lambda link: 'assinado' in (link.get('title') or '').lower(), reverse=True)
        if not anexos:
            return {'id': sessao['id'], 'pdf': None}, None
        url = urljoin(coletor.BASE, anexos[0].get('href'))
        if not url.startswith(coletor.BASE + '/arquivo?'):
            raise ValueError('Anexo da ata fora do endereço oficial.')
        conteudo = baixar_bytes(url)
        if not conteudo.startswith(b'%PDF-'):
            raise ValueError(f'O anexo da sessão {sessao["id"]} não é um PDF.')
        leitor = PdfReader(BytesIO(conteudo))
        if not leitor.pages:
            raise ValueError('Ata sem páginas.')
        return {'id': sessao['id'], 'pdf': url}, leitor.pages[0].extract_text()

    with ThreadPoolExecutor(max_workers=4) as pool:
        resultados = list(pool.map(por_sessao, sessoes))
    (pasta / 'downloads.json').write_text(json.dumps([r[0] for r in resultados], ensure_ascii=False), encoding='utf-8')
    textos = {r[0]['id']: r[1] for r in resultados if r[1] is not None}
    (pasta / 'primeiras-paginas.json').write_text(json.dumps(textos, ensure_ascii=False), encoding='utf-8')
    print(f'Atas oficiais baixadas e lidas em {len(textos)} de {len(sessoes)} sessões.', flush=True)
    return pasta


def coletar_tce(raw, fim):
    pasta = raw / 'tcesp-desde-2025'
    pasta.mkdir(parents=True, exist_ok=True)
    periodos = [f'{ano}-{mes:02d}' for ano in range(2025, int(fim[:4]) + 1)
                for mes in range(1, 13) if f'{ano}-{mes:02d}' <= fim[:7]]

    def por_mes(periodo):
        ano, mes = periodo.split('-')
        url = f'https://transparencia.tce.sp.gov.br/api/json/despesas/araras/{ano}/{int(mes)}'
        dados = json.loads(baixar_bytes(url).decode('utf-8-sig'))
        if not isinstance(dados, list):
            raise ValueError(f'O TCE-SP retornou um arquivo inválido para {periodo}.')
        (pasta / f'{periodo}.json').write_text(json.dumps(dados, ensure_ascii=False), encoding='utf-8')
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(por_mes, periodos))
    print(f'TCE-SP consultado em {len(periodos)} meses.', flush=True)


def atualizar(trabalho, fim):
    destino = trabalho / 'dist'
    raw = trabalho / 'raw'
    cache = trabalho / 'cache' / 'siscam'
    raw.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    if (destino / 'propostas').is_dir():
        for arquivo in (destino / 'propostas').glob('*.json'):
            arquivo.unlink()
    shutil.copytree(RAIZ / 'dist', destino, dirs_exist_ok=True, ignore=shutil.ignore_patterns('server', 'propostas'))
    executar(sys.executable, '-u', 'scripts/coletar-legislativo.py', '--inicio', '2025-01-01', '--ate', fim,
             '--cache', cache, '--saida', destino / 'legislativo.js')
    legislativo = validacao.ler_dados(destino, 'legislativo.js', 'ARARAS_LEGISLATIVO')
    anteriores = validacao.ler_dados(RAIZ / 'dist', 'propostas.js', 'ARARAS_PROPOSTAS')['perfis']
    origem_propostas = coletar_propostas(legislativo['vereadores'], anteriores, cache, raw, fim)
    classificacao.publicar(origem_propostas, destino, '2025-01-01', fim)
    executar(sys.executable, 'scripts/gerar-territorio.py', '--destino', destino)
    pasta_atas = coletar_atas(legislativo['sessoes'], cache, raw)
    executar('node', 'scripts/auditar-presencas.js', '--site', '--dist', destino, '--atas', pasta_atas)
    executar('node', 'scripts/coletar-financas.mjs', raw, destino, fim)
    coletar_tce(raw, fim)
    executar(sys.executable, 'scripts/preparar-financas.py', '--inicio', '2025-01-01', '--fim', fim,
             '--origem', raw, '--destino', destino)
    return destino, validacao.validar(RAIZ / 'dist', destino, fim)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--trabalho', type=Path, default=RAIZ / '.build' / 'atualizacao')
    args = parser.parse_args()
    trabalho = args.trabalho.resolve()
    if not trabalho.is_relative_to(RAIZ / '.build'):
        raise ValueError('A pasta temporária precisa ficar dentro de .build no projeto.')
    agora = datetime.now(ZoneInfo('America/Sao_Paulo'))
    fim = min(agora.date().isoformat(), '2028-12-31')
    relatorio = {'iniciadoEm': agora.isoformat(), 'inicio': '2025-01-01', 'fim': fim,
                 'aprovado': False, 'etapa': 'coleta e validação'}
    trabalho.mkdir(parents=True, exist_ok=True)
    referencia = {str(p.relative_to(RAIZ / 'dist')): sha256(p.read_bytes()).hexdigest()
                  for p in (RAIZ / 'dist').rglob('*') if p.is_file()}
    try:
        destino, verificacoes = atualizar(trabalho, fim)
        relatorio.update(aprovado=True, verificacoes=verificacoes, concluidoEm=datetime.now(ZoneInfo('America/Sao_Paulo')).isoformat())
        (destino / 'atualizacao.json').write_text(json.dumps(relatorio, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'COLETA APROVADA. {verificacoes["sessoes"]} sessões e {verificacoes["propostas"]} propostas. Pasta candidata {destino}', flush=True)
        return 0
    except Exception as erro:
        relatorio['erro'] = str(erro)
        print(f'PUBLICAÇÃO BLOQUEADA. {erro}', file=sys.stderr, flush=True)
        return 1
    finally:
        depois = {str(p.relative_to(RAIZ / 'dist')): sha256(p.read_bytes()).hexdigest()
                  for p in (RAIZ / 'dist').rglob('*') if p.is_file()}
        relatorio['referenciaPreservada'] = referencia == depois
        try:
            coletado = validacao.carregar(trabalho / 'dist')
            relatorio['coletado'] = {
                'vereadoresEmExercicio': sum(p['emExercicio'] for p in coletado['legislativo']['vereadores']),
                'sessoes': len(coletado['legislativo']['sessoes']),
                'propostas': coletado['territorio']['total'],
                'contratos': len(coletado['financas']['contratos']['lista']),
                'mesesDespesas': len(coletado['financas']['despesas']),
                'conferenciaPresenca': coletado['auditoria']['totais'],
            }
        except (OSError, ValueError, KeyError):
            pass
        (trabalho / 'relatorio.json').write_text(json.dumps(relatorio, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    sys.exit(main())
