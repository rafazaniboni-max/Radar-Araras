"""Só confirma a entrega quando o domínio serve os arquivos da coleta aprovada."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

RAIZ = Path(__file__).resolve().parents[1]
DOMINIO = 'https://www.radarararas.com.br/'
ARQUIVOS = ('index.html', 'legislativo.js', 'auditoria-presencas.js', 'financas.js',
            'pagamentos.js', 'propostas.js', 'territorio-resumo.js',
            'historico-documentos.js', 'territorio.json', 'app.js', 'radar.js', 'estilos.css', 'radar.css')


def baixar(url):
    pedido = Request(url, headers={'User-Agent': 'RadarAraras/2.0 (conferencia da publicacao)'})
    with urlopen(pedido, timeout=20) as resposta:
        endereco = urlsplit(resposta.url)
        if endereco.scheme != 'https' or endereco.hostname not in ('radarararas.com.br', 'www.radarararas.com.br'):
            raise ValueError('O domínio redirecionou a consulta para outro endereço.')
        return resposta.read()


def conferir(pasta, ler=baixar):
    pasta = Path(pasta)
    esperado = json.loads((pasta / 'atualizacao.json').read_text(encoding='utf-8'))
    if esperado.get('aprovado') is not True:
        raise ValueError('A pasta candidata não tem uma coleta aprovada.')
    publicado = json.loads(ler(urljoin(DOMINIO, 'atualizacao.json')))
    if publicado.get('aprovado') is not True or publicado.get('concluidoEm') != esperado['concluidoEm']:
        raise ValueError('O domínio ainda serve o relatório de outra coleta.')
    html = (pasta / 'index.html').read_text(encoding='utf-8')
    revisao = re.search(r'data-coleta="([a-f0-9]{20})"', html)
    if not revisao:
        raise ValueError('A coleta aprovada não tem revisão de dados.')
    for nome in ARQUIVOS:
        caminho = '' if nome == 'index.html' else f'{nome}?v={revisao[1]}'
        conteudo = ler(urljoin(DOMINIO, caminho))
        assinatura = hashlib.sha256(conteudo).hexdigest()
        if assinatura != esperado['verificacoes']['sha256'][nome]:
            raise ValueError(f'O domínio ainda não entrega a versão aprovada de {nome}.')
    return {'aprovado': True, 'dominio': DOMINIO, 'fim': esperado['fim'],
            'coletaConcluidaEm': esperado['concluidoEm'], 'revisao': revisao[1],
            'arquivosConferidos': len(ARQUIVOS)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pasta', type=Path, default=RAIZ / 'dist')
    parser.add_argument('--tentativas', type=int, default=80)
    parser.add_argument('--intervalo', type=float, default=15)
    parser.add_argument('--relatorio', type=Path, default=RAIZ / '.build/hostinger/entrega.json')
    args = parser.parse_args()
    if args.tentativas < 1 or args.intervalo < 0:
        parser.error('Número de tentativas ou intervalo inválido.')
    resultado = {'aprovado': False, 'dominio': DOMINIO}
    for tentativa in range(1, args.tentativas + 1):
        try:
            resultado = conferir(args.pasta)
            print(f"ENTREGA CONFIRMADA: {resultado['fim']}, revisão {resultado['revisao']}.", flush=True)
            break
        except (OSError, ValueError, KeyError) as erro:
            resultado = {'aprovado': False, 'dominio': DOMINIO, 'erro': str(erro)}
            print(f'Conferência {tentativa}/{args.tentativas}: {erro}', flush=True)
            if tentativa < args.tentativas:
                time.sleep(args.intervalo)
    resultado['conferidoEm'] = datetime.now(timezone.utc).isoformat()
    args.relatorio.parent.mkdir(parents=True, exist_ok=True)
    args.relatorio.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding='utf-8')
    if not resultado['aprovado']:
        raise SystemExit('A coleta foi aprovada, mas sua entrega no domínio não foi confirmada. Verifique a integração da Hostinger.')


if __name__ == '__main__':
    main()
