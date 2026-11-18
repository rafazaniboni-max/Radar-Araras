"""Preserva registros oficiais anteriores e as versões observadas de cada alteração."""

from copy import deepcopy
from importlib.util import module_from_spec, spec_from_file_location
import json
from math import ceil
from pathlib import Path

spec = spec_from_file_location('validacao_historico', Path(__file__).with_name('validar-atualizacao.py'))
validacao = module_from_spec(spec)
spec.loader.exec_module(validacao)
CAMPOS = ('id', 'titulo', 'data', 'assunto', 'tipo', 'url')


def ler_historico(pasta):
    arquivo = Path(pasta) / 'historico-documentos.json'
    return json.loads(arquivo.read_text(encoding='utf-8')) if arquivo.exists() else {'versao': 1, 'documentos': {}}


def registros_anteriores(pasta):
    indice = validacao.ler_dados(pasta, 'propostas.js', 'ARARAS_PROPOSTAS')
    perfis = {}
    for autor, perfil in indice['perfis'].items():
        linhas = []
        for grupo, total in perfil['grupos'].items():
            if total:
                linhas.extend(json.loads((Path(pasta) / 'propostas' / f'{autor}-{grupo}.json').read_text(encoding='utf-8')))
        perfis[autor] = linhas
    return indice, perfis


def agrupar(perfis):
    documentos = {}
    for autor in sorted(perfis):
        linhas = perfis[autor]
        vistos = set()
        for linha in linhas:
            identificador = str(linha['id'])
            if identificador in vistos:
                raise ValueError(f'Documento duplicado no perfil {autor}: {identificador}.')
            vistos.add(identificador)
            dados = {campo: linha[campo] for campo in CAMPOS}
            dados['id'] = identificador
            if identificador not in documentos:
                documentos[identificador] = dict(dados, autores=[], registrosPorAutor={})
            anterior = documentos[identificador]
            # A listagem do perfil usa tipos no plural; a pesquisa avançada pode usar singular.
            # Conservamos a forma exata de cada fonte em registrosPorAutor.
            if any(anterior[campo] != dados[campo] for campo in CAMPOS if campo != 'tipo'):
                raise ValueError(f'Informações divergentes entre coautores do documento {identificador}.')
            anterior['autores'].append(str(autor))
            anterior['registrosPorAutor'][str(autor)] = dados
    for documento in documentos.values():
        documento['autores'].sort()
    return documentos


def reconciliar(base, origem, destino, fim):
    """Só uma ausência isolada em perfis completos pode ser preservada automaticamente."""
    indice, antigos_por_autor = registros_anteriores(base)
    historico = deepcopy(ler_historico(base))
    perfis = {str(dados['id']): (arquivo, dados) for arquivo in Path(origem).glob('*.json')
              for dados in [json.loads(arquivo.read_text(encoding='utf-8-sig'))]}
    if not set(antigos_por_autor) <= perfis.keys():
        raise ValueError('Perfis anteriores ausentes: não é possível tratar como desaparecimento isolado.')
    for autor, (arquivo, perfil) in perfis.items():
        if perfil.get('completo') is not True:
            raise ValueError(f'Coleta incompleta para o autor {autor}; histórico não substitui uma coleta completa.')
        anteriores = antigos_por_autor.get(autor, [])
        ids_atuais = {str(r['id']) for r in perfil['registros']}
        esperados = {str(r['id']) for r in anteriores if r.get('acompanhamento', {}).get('estado') != 'nao_localizado'}
        ausentes = esperados - ids_atuais
        if esperados and not ids_atuais:
            raise ValueError(f'Perfil {autor} veio vazio; publicação bloqueada.')
        if len(ausentes) > max(2, ceil(len(esperados) * .005)):
            raise ValueError(f'Queda incomum no perfil {autor}: {len(ausentes)} documentos ausentes; publicação bloqueada.')
    antigos = agrupar(antigos_por_autor)
    atuais = agrupar({autor: p['registros'] for autor, (_, p) in perfis.items()})
    faltantes = set(antigos) - set(atuais)
    novas_ausencias = faltantes - {id for id, item in historico['documentos'].items() if item['estado'] == 'nao_localizado'}
    if len(novas_ausencias) > max(3, ceil(len(antigos) * .005)):
        raise ValueError('Muitos documentos desapareceram simultaneamente; revisão necessária.')
    for identificador in sorted(set(antigos) | set(atuais)):
        velho, novo = antigos.get(identificador), atuais.get(identificador)
        item = historico['documentos'].get(identificador)
        campos = [campo for campo in (*CAMPOS, 'autores', 'registrosPorAutor') if velho and novo and velho[campo] != novo[campo]]
        evento = 'nao_localizado' if velho and not novo else 'alterado' if campos else 'reapareceu' if novo and item and item['estado'] == 'nao_localizado' else None
        if evento and not item:
            item = {'estado': 'localizado', 'ultimaConfirmacao': indice['fim'], 'versoes': [], 'eventos': []}
            if velho:
                item['versoes'].append({'observadaEm': indice['fim'], 'dados': deepcopy(velho)})
            historico['documentos'][identificador] = item
        if not item:
            continue
        if novo:
            if not item['versoes'] or item['versoes'][-1]['dados'] != novo:
                item['versoes'].append({'observadaEm': fim, 'dados': deepcopy(novo)})
            item['ultimaConfirmacao'] = fim
        if evento and (evento != 'nao_localizado' or item['estado'] != 'nao_localizado'):
            item['eventos'].append({'data': fim, 'tipo': evento, 'campos': campos})
        item['estado'] = 'nao_localizado' if not novo else 'localizado'
        item['verificadoEm'] = fim
    # Restaura somente o que não foi mais localizado, com a autoria da última versão.
    for identificador in faltantes:
        registro = antigos[identificador]
        for autor in registro['autores']:
            perfis[autor][1]['registros'].append(deepcopy(registro['registrosPorAutor'][autor]))
    for autor, (arquivo, perfil) in perfis.items():
        for linha in perfil['registros']:
            item = historico['documentos'].get(str(linha['id']))
            if item:
                linha['acompanhamento'] = {chave: item[chave] for chave in ('estado', 'ultimaConfirmacao', 'verificadoEm')}
                linha['acompanhamento']['ultimaAlteracao'] = item['eventos'][-1]['data']
            else:
                linha.pop('acompanhamento', None)
        arquivo.write_text(json.dumps(perfil, ensure_ascii=False), encoding='utf-8')
    historico['verificadoEm'] = fim
    Path(destino).mkdir(parents=True, exist_ok=True)
    (Path(destino) / 'historico-documentos.json').write_text(json.dumps(historico, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (Path(destino) / 'historico-documentos.js').write_text('globalThis.ARARAS_HISTORICO_DOCUMENTOS = ' + json.dumps(historico, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    return {'naoLocalizados': sorted(faltantes), 'comHistorico': len(historico['documentos'])}


def validar_historico(base, candidata):
    """O arquivo de versões é cumulativo e os registros preservados não podem ser alterados."""
    anterior = ler_historico(base)
    atual = ler_historico(candidata)
    for id, item in anterior['documentos'].items():
        novo = atual['documentos'].get(id)
        validacao.exigir(novo is not None, f'Histórico desapareceu: {id}.')
        for campo in ('versoes', 'eventos'):
            validacao.exigir(novo[campo][:len(item[campo])] == item[campo], f'Histórico anterior foi alterado: {id}.')
    indice, perfis = registros_anteriores(candidata)
    docs = agrupar(perfis)
    for linhas in perfis.values():
        for linha in linhas:
            aviso = linha.get('acompanhamento')
            if aviso:
                item = atual['documentos'].get(str(linha['id']))
                validacao.exigir(item is not None and aviso['estado'] == item['estado'] and aviso['ultimaConfirmacao'] == item['ultimaConfirmacao'], f'Aviso sem histórico correspondente: {linha["id"]}.')
    for id, item in atual['documentos'].items():
        validacao.exigir(id in docs and item['versoes'], f'Histórico sem documento: {id}.')
        validacao.exigir(docs[id] == item['versoes'][-1]['dados'], f'Última versão divergente: {id}.')
        validacao.exigir(item['estado'] in ('nao_localizado', 'localizado'), f'Estado não confirmado: {id}.')
        for versao in item['versoes']:
            validacao.exigir(versao['observadaEm'] <= indice['fim'], f'Histórico com data futura: {id}.')
    return len(atual['documentos'])
