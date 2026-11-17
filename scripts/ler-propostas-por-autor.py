"""Extrai propostas do HTML integral por autor disponibilizado pelo Siscam."""

import argparse
from datetime import datetime
import json
from pathlib import Path
import re
from unicodedata import normalize
from urllib.parse import urlencode, urljoin

from lxml import html


BASE = "https://araras.siscam.com.br"
TIPOS = {
    "indicacoes", "mocoes", "requerimentos", "projetos de lei", "projetos de lei complementar",
    "projetos de decreto legislativo", "projetos de resolucao", "projetos de emenda a lei organica",
    "emendas", "substitutivos",
}
TIPOS_SINGULARES = {
    "indicacao", "mocao", "requerimento", "projeto de lei", "projeto de lei complementar",
    "projeto de decreto legislativo", "projeto de resolucao", "projeto de emenda a lei organica", "emenda", "substitutivo",
}


def chave(valor):
    return normalize("NFKD", valor).encode("ascii", "ignore").decode().lower()


def ler_perfil(arquivo, inicio, fim):
    identificador = arquivo.stem
    pagina = html.fromstring(arquivo.read_bytes(), parser=html.HTMLParser(encoding="utf-8"))
    titulo = pagina.xpath("string(//title)")
    nome = re.search(r"Vereadores\s*-\s*(.*?)\s*-\s*Proposituras", titulo)
    if nome is None:
        raise ValueError(f"A lista oficial não está disponível no arquivo {arquivo.name}")
    registros = {}
    for cabecalho in pagina.xpath("//h3"):
        secao = re.fullmatch(r"(.+?)\s*\((\d+)\)", cabecalho.text_content().strip())
        if not secao or chave(secao[1]) not in TIPOS:
            continue
        links = cabecalho.getparent().xpath("./p/a[starts-with(@href, '/Documentos/Documento/')]")
        if len(links) != int(secao[2]):
            raise ValueError(f"{identificador}: a lista de {secao[1]} contém {len(links)} de {secao[2]} registros")
        for link in links:
            cauda = " ".join((link.tail or "").split())
            data_e_assunto = re.fullmatch(r"-\s*(\d{2}/\d{2}/\d{4})\s*-\s*(.*)", cauda)
            if not data_e_assunto:
                raise ValueError(f"{identificador}: data não reconhecida em {link.get('href')}")
            data = datetime.strptime(data_e_assunto[1], "%d/%m/%Y").date().isoformat()
            if not inicio <= data <= fim:
                continue
            caminho = link.get("href")
            identificador_documento = caminho.rsplit("/", 1)[-1]
            registros[identificador_documento] = {
                "id": identificador_documento, "titulo": link.get("title") or link.text_content().strip(),
                "data": data, "assunto": data_e_assunto[2], "tipo": secao[1], "url": urljoin(BASE, caminho),
            }
    return {"id": identificador, "nome": nome[1], "fonte": f"{BASE}/Vereadores/Proposituras/{identificador}",
            "completo": True, "registros": list(registros.values())}


def campo(item, nome):
    for rotulo in item.xpath(".//strong"):
        if rotulo.text_content().strip() == nome + ":":
            return " ".join((rotulo.tail or "").split())
    return ""


def ler_pesquisa(identificador, arquivos, inicio, fim):
    registros = []
    ids = set()
    totais = set()
    nomes = set()
    for arquivo in arquivos:
        pagina = html.fromstring(arquivo.read_bytes(), parser=html.HTMLParser(encoding="utf-8"))
        total = re.search(r"(\d+)\s+registro\(s\) encontrado\(s\)", pagina.text_content())
        if total is None:
            raise ValueError(f"Não foi encontrado o total oficial em {arquivo.name}")
        totais.add(int(total[1]))
        for link in pagina.xpath("//h4/a[starts-with(@href,'/Documentos/Documento/')]"):
            caminho = link.get("href")
            documento = caminho.rsplit("/", 1)[-1]
            if documento in ids:
                continue
            ids.add(documento)
            titulo = link.text_content().strip()
            tipo = re.split(r"\s+N[º°o.]\s*", titulo, maxsplit=1)[0]
            item = link.getparent().getparent()
            autoria = campo(item, "Autoria")
            if autoria and "," not in autoria:
                nomes.add(autoria)
            if chave(tipo) not in TIPOS_SINGULARES:
                continue
            data = datetime.strptime(campo(item, "Data"), "%d/%m/%Y").date().isoformat()
            if inicio <= data <= fim:
                registros.append({"id": documento, "titulo": titulo, "data": data, "assunto": campo(item, "Assunto"),
                                  "tipo": tipo, "url": urljoin(BASE, caminho)})
    if totais != {len(ids)} or len(nomes) != 1:
        raise ValueError(f"Pesquisa por autor incompleta ou inconsistente: {identificador}, totais {totais}, {len(ids)} registros")
    parametros = urlencode({"AutoriaId": identificador, "Modulo": 8, "Pesquisa": "Avancada",
                            "AnoInicial": inicio[:4], "AnoFinal": fim[:4], "Pagina": 1})
    return {"id": identificador, "nome": nomes.pop(), "fonte": f"{BASE}/Documentos/Pesquisa/74?{parametros}",
            "completo": True, "registros": registros}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("origem", type=Path)
    parser.add_argument("destino", type=Path)
    parser.add_argument("--inicio", default="2025-01-01")
    parser.add_argument("--fim", required=True)
    parser.add_argument("--pesquisa", nargs=2, metavar=("AUTOR_ID", "PAGINAS"),
                        help="Pesquisa oficial arquivada, quando a lista integral do autor estiver indisponível")
    args = parser.parse_args()
    args.destino.mkdir(parents=True, exist_ok=True)
    for arquivo in sorted(args.origem.glob("*.html")):
        perfil = ler_perfil(arquivo, args.inicio, args.fim)
        (args.destino / f"{perfil['id']}.json").write_text(json.dumps(perfil, ensure_ascii=False), encoding="utf-8")
        print(perfil["id"], len(perfil["registros"]))
    if args.pesquisa:
        identificador, padrao = args.pesquisa
        filtro = Path(padrao)
        perfil = ler_pesquisa(identificador, sorted(filtro.parent.glob(filtro.name)), args.inicio, args.fim)
        (args.destino / f"{identificador}.json").write_text(json.dumps(perfil, ensure_ascii=False), encoding="utf-8")
        print(identificador, len(perfil["registros"]))
