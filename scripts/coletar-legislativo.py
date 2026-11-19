"""Atualiza os dados legislativos publicados no Siscam. Requer Python e lxml."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from math import ceil
from hashlib import sha256
import gzip
import json
from pathlib import Path
import re
import time
from unicodedata import normalize
from urllib.error import HTTPError
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen

from lxml import html


BASE = "https://araras.siscam.com.br"
RAIZ = Path(__file__).resolve().parent.parent
TIPOS = {
    "projetos": "projetos de lei",
    "indicacoes": "indicacoes",
    "mocoes": "mocoes",
    "requerimentos": "requerimentos",
    "projetosComplementares": "projetos de lei complementar",
    "decretosLegislativos": "projetos de decreto legislativo",
    "projetosResolucao": "projetos de resolucao",
    "emendasLeiOrganica": "projetos de emenda a lei organica",
    "emendas": "emendas",
    "substitutivos": "substitutivos",
}
ITENS = "./div[contains(concat(' ', @class, ' '), ' data-list-item ')]"


def texto(elemento):
    return " ".join(elemento.text_content().split())


def chave(valor):
    ascii_text = normalize("NFKD", valor).encode("ascii", "ignore").decode()
    return " ".join(re.sub(r"[^a-z0-9 ]", "", ascii_text.lower()).split())


def nome_exibicao(nome):
    return " ".join(
        palavra.lower() if palavra.lower() in {"da", "de", "do", "das", "dos", "e"}
        else palavra.title()
        for palavra in nome.split()
    )


def campo(elemento, rotulo):
    for strong in elemento.xpath(".//strong"):
        if texto(strong).rstrip(":").strip() == rotulo:
            return texto(strong.getparent()).partition(":")[2].strip()
    return None


def data_iso(valor):
    return datetime.strptime(valor, "%d/%m/%Y").date().isoformat() if valor else None


def fonte(caminho, **parametros):
    url = urljoin(BASE, caminho)
    return f"{url}?{urlencode(parametros)}" if parametros else url


def buscar(url, cache, timeout=22):
    destino = cache / f"{sha256(url.encode()).hexdigest()}.html" if cache else None
    if destino and destino.exists():
        return html.fromstring(destino.read_bytes(), parser=html.HTMLParser(encoding="utf-8"))
    for tentativa in range(3):
        try:
            requisicao = Request(url, headers={"User-Agent": "ArarasEmDados/1.0 (consulta pública)", "Accept-Encoding": "gzip"})
            with urlopen(requisicao, timeout=timeout) as resposta:
                conteudo = resposta.read()
                if resposta.headers.get('Content-Encoding', '').lower() == 'gzip':
                    conteudo = gzip.decompress(conteudo)
            pagina = html.fromstring(conteudo, parser=html.HTMLParser(encoding="utf-8"))
            if not pagina.xpath("//title[contains(.,'Câmara Municipal de Araras')]"):
                raise ValueError("Página inesperada no Siscam")
            if destino:
                destino.write_bytes(conteudo)
            return pagina
        except (OSError, ValueError) as erro:
            if tentativa == 2:
                raise RuntimeError(f"Falha ao ler {url}") from erro
            time.sleep(tentativa + 1)


def lista_sessoes(pagina):
    for link in pagina.xpath("//h4/a[starts-with(@href,'/Sessoes/Sessao/')]"):
        titulo = texto(link)
        if not re.search(r"\b(ordinaria|extraordinaria)\b", chave(titulo)):
            continue
        url = fonte(link.get("href"))
        yield {
            "id": url.rsplit("/", 1)[-1],
            "titulo": titulo,
            "url": url,
            "data": data_iso(campo(link.getparent().getparent(), "Data")),
        }


def secao(pagina, titulo):
    for h3 in pagina.xpath("//h3"):
        if chave(texto(h3)) == titulo and h3.getnext() is not None:
            return h3.getnext().xpath(ITENS)
    return []


def registros(item):
    for strong in item.xpath(".//p/strong"):
        grupo = re.fullmatch(r"(.+?)\s*\((\d+)\)", texto(strong))
        if not grupo:
            continue
        situacao, total = grupo.groups()
        situacao = {"Presentes": "Presente", "Ausentes": "Ausente"}.get(situacao, situacao)
        nomes = texto(strong.getparent())[grupo.end():].strip(" -–—")
        nomes = [nome.strip() for nome in nomes.split(",") if nome.strip()]
        if len(nomes) != int(total):
            raise ValueError(f"Contagem de nomes inesperada em {situacao}: {nomes}")
        for nome in nomes:
            yield {"nome": nome_exibicao(nome), "situacao": situacao}


def detalhe_sessao(pagina, sessao):
    if not pagina.xpath("//h3[contains(.,'Sessões -')]"):
        raise ValueError(f"Sessão sem título: {sessao['url']}")
    chamadas = [
        {"titulo": texto(item.xpath("./h4")[0]), "registros": list(registros(item))}
        for item in secao(pagina, "frequencias")
    ]
    votacoes = []
    for item in secao(pagina, "votacoes"):
        links = item.xpath("./p/strong/a")
        titulo = texto(links[0]) if links else campo(item, "Assunto")
        tipo = campo(item, "Votação")
        quorum = campo(item, "Quórum")
        sigilo = chave(f"{tipo or ''} {quorum or ''}")
        secreta = "secret" in sigilo or "votsec" in sigilo or "vot sec" in sigilo
        votacoes.append({
            "titulo": titulo or "Votação",
            "assunto": campo(item, "Assunto"),
            "url": fonte(links[0].get("href")) if links else None,
            "tipo": tipo,
            "fase": campo(item, "Fase"),
            "quorum": quorum,
            "resultado": campo(item, "Resultado"),
            "secreta": secreta,
            "votos": list(registros(item)),
        })
    return {**sessao, "chamadas": chamadas, "votacoes": votacoes}


def perfil(identificador, nome, partido, em_exercicio):
    return {
        "id": identificador,
        "nome": nome_exibicao(nome),
        "partido": partido,
        "perfil": fonte(f"/Vereadores/Vereador/{identificador}") if em_exercicio else None,
        "emExercicio": em_exercicio,
        "propostasUrl": fonte(f"/Vereadores/Contagem/{identificador}"),
    }


def contagens(pagina, ano):
    for tabela in pagina.xpath("//table"):
        cabecalho = next((linha for linha in tabela.xpath("./thead/tr")
                          if len(linha) and chave(texto(linha[0])) == "tipo"), None)
        if cabecalho is None:
            continue
        colunas = [texto(celula) for celula in cabecalho.xpath("./th|./td")]
        if str(ano) not in colunas:
            return dict.fromkeys(TIPOS)
        resultados = dict.fromkeys(TIPOS, 0)
        indice_ano = colunas.index(str(ano))
        for linha in tabela.xpath("./tbody/tr"):
            celulas = linha.xpath("./td")
            if len(celulas) <= indice_ano:
                continue
            tipo = chave(texto(celulas[0]))
            for resultado, nome in TIPOS.items():
                if tipo == nome:
                    valor = texto(celulas[indice_ano]).replace(".", "")
                    resultados[resultado] = 0 if valor == "-" else int(valor)
        return resultados
    return dict.fromkeys(TIPOS)


def main(args):
    inicio = args.inicio or f"{args.ano or date.today().year}-01-01"
    anos = [args.ano] if args.ano else list(range(int(inicio[:4]), int(args.ate[:4]) + 1))
    cache = args.cache
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
    ler = lambda url: buscar(url, cache)

    def ler_opcional(url):
        try:
            return ler(url)
        except RuntimeError as erro:
            if isinstance(erro.__cause__, HTTPError) and erro.__cause__.code == 404:
                return None
            raise

    fontes = {
        "vereadores": fonte("/vereadores"),
        "sessoes": fonte("/sessoes"),
        "sessoesConsulta": fonte("/Sessoes/Pesquisa", Classe="Sessao", pagina=1, tipo=0,
                                  dataInicial=date.fromisoformat(inicio).strftime("%d/%m/%Y"),
                                  dataFinal=date.fromisoformat(args.ate).strftime("%d/%m/%Y")),
    }
    with ThreadPoolExecutor(max_workers=6) as pool:
        def busca_sessoes(ano, pagina=1):
            return fonte("/Sessoes/Pesquisa", Classe="Sessao", pagina=pagina, tipo=0, ano=ano)

        vereadores_pagina, autoria, *indices = pool.map(ler, [fontes["vereadores"], fonte("/index/74/8"),
                                                             *(busca_sessoes(ano) for ano in anos)])
        candidatos = autoria.xpath("//select[@id='autoriaid']/optgroup[contains(@label, 'Vereadores')]/option[@value]")
        atuais = {
            chave(texto(link)): perfil(
                link.get("href").rsplit("/", 1)[-1], texto(link),
                campo(link.getparent().getparent(), "Partido"), True,
            )
            for link in vereadores_pagina.xpath("//h4/a[starts-with(@href,'/Vereadores/Vereador/')]")
        }
        if not atuais:
            raise ValueError("Lista de vereadores vazia")
        paginas = []
        totais_publicados = {}
        paginas_por_ano = {ano: [indice] for ano, indice in zip(anos, indices, strict=True)}
        for ano, indice in zip(anos, indices, strict=True):
            total = re.search(r"(\d+)\s+registro\(s\) encontrado\(s\)", texto(indice))
            if total is None:
                raise ValueError(f"Pesquisa de sessões sem total para {ano}")
            totais_publicados[ano] = int(total[1])
            paginas.extend((ano, busca_sessoes(ano, n)) for n in range(2, ceil(int(total[1]) / 15) + 1))
        outros = list(pool.map(lambda item: (item[0], ler(item[1])), paginas))
        for ano, pagina in outros:
            paginas_por_ano[ano].append(pagina)
        for ano, paginas_lidas in paginas_por_ano.items():
            links = {link.get('href') for pagina in paginas_lidas
                     for link in pagina.xpath("//h4/a[starts-with(@href,'/Sessoes/Sessao/')]")}
            if len(links) != totais_publicados[ano]:
                raise ValueError(f"Paginação incompleta de sessões em {ano}: {len(links)} de {totais_publicados[ano]} registros")
        sessoes = {
            sessao["id"]: sessao
            for pagina in [*indices, *(pagina for _, pagina in outros)]
            for sessao in lista_sessoes(pagina)
            if sessao["data"] and inicio <= sessao["data"] <= args.ate
        }
        if not sessoes:
            raise ValueError("Pesquisa de sessões sem resultados")
        print(f"{len(atuais)} vereadores em exercício e {len(sessoes)} sessões para consulta.", flush=True)
        sessoes = list(pool.map(lambda s: detalhe_sessao(ler(s["url"]), s), sessoes.values()))
        pessoas = dict(atuais)
        por_nome = {}
        for opcao in candidatos:
            nome, identificador = texto(opcao), opcao.get("value")
            por_nome.setdefault(chave(nome), set()).add((nome, identificador))
        for sessao in sessoes:
            listas = [c["registros"] for c in sessao["chamadas"]] + [v["votos"] for v in sessao["votacoes"]]
            for registro in (r for lista in listas for r in lista):
                indice_nome = chave(registro["nome"])
                if indice_nome not in pessoas:
                    opcoes = sorted(por_nome.get(indice_nome, []))
                    if len(opcoes) > 1:
                        opcoes_ano = []
                        for opcao in opcoes:
                            tabela = ler_opcional(fonte(f"/Vereadores/Contagem/{opcao[1]}"))
                            if tabela is not None and any(v is not None for ano in anos for v in contagens(tabela, ano).values()):
                                opcoes_ano.append(opcao)
                        opcoes = opcoes_ano
                    ajuste = opcoes[0] if len(opcoes) == 1 else None
                    if ajuste:
                        nome, identificador = ajuste
                        pessoas[indice_nome] = perfil(identificador, nome, None, False)
                    else:
                        pessoas[indice_nome] = {
                            "id": None, "nome": registro["nome"], "partido": None, "perfil": None,
                            "emExercicio": False, "propostasUrl": None,
                        }
                registro["id"] = pessoas[indice_nome]["id"]

        vereadores = sorted(pessoas.values(), key=lambda item: chave(item["nome"]))
    sessoes.sort(key=lambda item: (item["data"], int(item["id"])), reverse=True)
    cobertura = {
        "sessoesPublicadas": len(sessoes),
        "sessoesLidas": len(sessoes),
        "comChamada": sum(any(c["registros"] for c in s["chamadas"]) for s in sessoes),
        "comVotacao": sum(bool(s["votacoes"]) for s in sessoes),
    }
    dados = {
        "coleta": args.ate,
        "inicio": inicio,
        "fim": args.ate,
        "fontes": fontes,
        "vereadores": vereadores,
        "sessoes": sessoes,
        "cobertura": cobertura,
    }
    args.saida.parent.mkdir(parents=True, exist_ok=True)
    temporario = args.saida.with_suffix(".tmp")
    conteudo = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
    temporario.write_text(f"globalThis.ARARAS_LEGISLATIVO = {conteudo};\n", encoding="utf-8")
    temporario.replace(args.saida)
    print(f"{len(vereadores)} perfis. Cobertura: {cobertura}.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    recorte = parser.add_mutually_exclusive_group()
    recorte.add_argument("--ano", type=int)
    recorte.add_argument("--inicio", type=lambda texto: date.fromisoformat(texto).isoformat())
    parser.add_argument("--ate", default=date.today().isoformat())
    parser.add_argument("--cache", type=Path)
    parser.add_argument("--saida", type=Path, default=RAIZ / "dist" / "legislativo.js")
    main(parser.parse_args())
