"""Classifica matérias do Siscam pela mesma regra para qualquer autoria."""

import argparse
from datetime import date
import json
from pathlib import Path
import re
from unicodedata import normalize


GRUPOS = {
    "melhorias": ["Pedidos de melhoria nos bairros", "Pedidos de obra, manutenção ou melhoria de um serviço público local, como poda, iluminação, pavimentação e atendimento em unidades públicas."],
    "perguntas": ["Perguntas e cobranças", "Pedidos expressos de informações, esclarecimentos, prestação de contas ou fiscalização, em qualquer tipo de matéria."],
    "homenagens": ["Homenagens", "Parabéns, pesar, premiações, títulos, nomes de espaços públicos e datas comemorativas."],
    "leis": ["Propostas de lei", "Projetos de lei e outras propostas formais de norma, como projetos de decreto legislativo, resoluções, emendas e substitutivos."],
    "outros": ["Outros", "Matérias com outros objetivos, como convocações, manifestações de apoio ou repúdio e pedidos de procedimento."],
}
ORDEM = ["homenagens", "leis", "perguntas", "melhorias", "outros"]

PERGUNTA = re.compile(
    r"\b(?:requer(?:imento)?|requeir[oa]|pedid[oa]|solicit\w*|cobr\w*|question\w*)\b.{0,100}"
    r"\b(?:informac\w+|esclareciment\w+|explicac\w+|prestacao de contas|fiscalizac\w+|resposta\w*|"
    r"relatorio (?:conclusivo )?de auditoria|providencias (?:ja |adotadas))\b"
    r"|^\s*(?:informac\w+|esclareciment\w+|prestacao de contas)\s+(?:sobre|referente|a respeito|acerca|do|da|dos|das)\b"
    r"|\b(?:solicita|requer|pede) (?:que (?:seja|sejam) )?(?:fiscaliz\w+|prestacao de contas)\b"
    r"|^\s*cobr(?:a|anca|ar)\s+(?:de|ao|da|do|das|dos|pelo|pela|providencias)\b"
    r"|\b(?:intensifica\w*|realiza\w*|execu\w*|reforco)\b.{0,40}\bfiscaliz\w+\b"
)
HONRA = re.compile(
    r"\b(?:pesar|condolencia\w*|parabeniz\w*|parabens|congratulac\w*|felicitac\w*|aplauso\w*|"
    r"homenage\w*|honraria\w*|condecorac\w*|titulo (?:honorifico|de cidad(?:ao|a))|diploma de (?:honra|merito))\b"
    r"|\b(?:confere|concede|outorga|institui|cria)\b.{0,95}\b(?:medalha|premio)\b"
    r"|\bmocao de (?:louvor|reconhecimento)\b"
)
NOME_PUBLICO = re.compile(
    r"\b(?:denomina(?:cao|r)?|nomeia|da nome|atribui (?:o )?nome|nome de)\b.{0,150}"
    r"\b(?:rua|avenida|logradouro|praca|via publica|travessa|rotatoria|ponte|viela|passarela|predio|"
    r"proprio publico|espaco publico|escola|creche|unidade de saude|cemiterio|parque|gin[a-z]+io)\b"
    r"|\bdenomina(?:cao)?\s+.{0,130}\b(?:logradouro|rua|avenida|praca)\b"
)
DATA_COMEMORATIVA = re.compile(
    r"\b(?:institui|criacao|cria|inclu\w*|estabelece|oficializa)\b.{0,100}"
    r"\b(?:data comemorativa|calendario (?:oficial|municipal|de eventos)|"
    r"(?:dia|semana|mes) (?:municipal|oficial|comemorativ[oa]|de conscientizacao))\b"
)
NORMA = re.compile(r"^(?:projeto(?:s)? (?:de|do) |emenda(?:s)?\b|substitutivo(?:s)?\b|mensage\w+ substitutiv\w+)")
PROCEDIMENTO = re.compile(
    r"\b(?:convoc\w*|realizac\w*|agend\w*) (?:de |da |uma )?(?:sessao|reuniao)\b"
    r"|\b(?:urgencia especial|retirada de pauta|adiamento (?:da|de) votacao)\b"
)
MANIFESTACAO = re.compile(r"\bmocao de (?:apoio|repudio)\b")
MELHORIA = re.compile(
    r"\b(?:poda|capin\w*|rocag\w*|tapa[- ]burac\w*|asfalt\w*|paviment\w*|recape\w*|iluminac\w*|"
    r"sinaliz\w*|faixa de pedestres?|lombad\w*|redutor\w* de velocidade|drenag\w*|bueir\w*|"
    r"recolhimento de lixo|coleta (?:de lixo|seletiva)|desobstruc\w*|desassore\w*|ponto de onibus|"
    r"corte (?:do|de) mato|corte de grama|supressao de arvore\w*|pavimento|semaforo\w*|guia rebaixada)\b"
    r"|\b(?:melhori\w*|refor[cç]\w*|repar\w*|manutenc\w*|reform\w*|limpez\w*|consert\w*|"
    r"instal\w*|implant\w*|implement\w*|adequac\w*|construc\w*|ampliac\w*|ampliar|troca|regulariz\w*|acessibilid\w*|"
    r"revitaliz\w*|pintur\w*|disponibiliz\w*|fornec\w*|distribui\w*|envio|substitui\w*|"
    r"remov\w*|remoc\w*|recolh\w*|demarc\w*|coloca\w*|recuper\w*|realoc\w*|desloc\w*|"
    r"transfer\w*|nivel\w*|restaur\w*|combate|reorganiz\w*|intensifica\w*)\b.{0,180}"
    r"\b(?:rua\w*|av\.|avenida\w*|via|estrada|bairro\w*|jardim|vila|residencial|conjunto habitacional|praca|parque|"
    r"calcada|brinqued\w*|escola\w*|creche|e\.?m\.?e\.?[fi]\.?|posto de saude|unidade de saude|ubs|esf|psf|upa|samu|"
    r"ponto de onibus|transporte publico|quadra|cemiterio|agua|esgoto|servico (?:publico|municipal)|iluminacao)\b"
    r"|\b(?:campanha|acao)\b.{0,110}\b(?:vacinacao|dengue|samu|postos de saude|escolas municipais)\b"
)


def normalizar(valor):
    return " ".join(normalize("NFKD", valor or "").encode("ascii", "ignore").decode().lower().split())


def classificar(proposta):
    assunto = normalizar(proposta.get("assunto"))
    titulo = normalizar(proposta.get("titulo"))
    tipo = normalizar(proposta.get("tipo"))
    consulta = PERGUNTA.search(assunto)
    normativa = NORMA.match(tipo) or NORMA.match(titulo)

    # Um pedido de convocação pode citar o título que será votado na sessão.
    if not normativa and not consulta and PROCEDIMENTO.search(assunto):
        return "outros"
    mencao_honorifica = HONRA.search(assunto) or NOME_PUBLICO.search(assunto) or DATA_COMEMORATIVA.search(assunto)
    if mencao_honorifica and (normativa or not consulta):
        return "homenagens"
    if normativa:
        return "leis"
    if consulta:
        return "perguntas"
    if not MANIFESTACAO.search(assunto) and MELHORIA.search(assunto):
        return "melhorias"
    return "outros"


def publicar(origem, destino, inicio, fim):
    pasta = destino / "propostas"
    pasta.mkdir(parents=True, exist_ok=True)
    indice = {"inicio": inicio, "fim": fim, "grupos": GRUPOS, "ordem": ORDEM, "perfis": {}}
    materias = {}
    for arquivo in sorted(origem.glob("*.json")):
        perfil = json.loads(arquivo.read_text(encoding="utf-8-sig"))
        identificador = str(perfil["id"])
        if not identificador.isdecimal():
            raise ValueError(f"Identificador oficial inválido em {arquivo.name}")
        grandes_grupos = {grupo: [] for grupo in GRUPOS}
        registrados = set()
        for proposta in sorted(perfil["registros"], key=lambda p: (p["data"], str(p["id"])), reverse=True):
            if not inicio <= proposta["data"] <= fim or proposta["id"] in registrados:
                continue
            registrados.add(proposta["id"])
            grupo = classificar(proposta)
            chave = str(proposta["id"])
            if materias.setdefault(chave, grupo) != grupo:
                raise ValueError(f"Classificação divergente para o documento oficial {chave}")
            registro = {chave: proposta[chave] for chave in ("id", "titulo", "data", "assunto", "tipo", "url")}
            if proposta.get('acompanhamento'):
                registro['acompanhamento'] = proposta['acompanhamento']
            grandes_grupos[grupo].append(registro)
        contagens = {grupo: len(lista) for grupo, lista in grandes_grupos.items()}
        for grupo, lista in grandes_grupos.items():
            if lista:
                (pasta / f"{identificador}-{grupo}.json").write_text(
                    json.dumps(lista, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
                )
        indice["perfis"][identificador] = {
            "fonte": perfil["fonte"], "completo": perfil["completo"], "total": sum(contagens.values()), "grupos": contagens,
        }
        if perfil.get('relacionadosNaoConferidos'):
            indice['perfis'][identificador]['relacionadosNaoConferidos'] = True
    if not indice["perfis"]:
        raise ValueError("A coleta de propostas está vazia")
    (destino / "propostas.js").write_text(
        "globalThis.ARARAS_PROPOSTAS = " + json.dumps(indice, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8"
    )
    print(f"{len(materias)} matérias únicas em {len(indice['perfis'])} perfis")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("origem", type=Path)
    parser.add_argument("destino", type=Path)
    parser.add_argument("--inicio", default="2025-01-01", type=lambda texto: date.fromisoformat(texto).isoformat())
    parser.add_argument("--fim", required=True, type=lambda texto: date.fromisoformat(texto).isoformat())
    args = parser.parse_args()
    publicar(args.origem, args.destino, args.inicio, args.fim)
