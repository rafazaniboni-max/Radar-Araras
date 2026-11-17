"""Indexa os lugares e cruza pedidos descritos nas ementas oficiais do Siscam."""

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import re
from unicodedata import normalize


PASTA = Path(__file__).resolve().parents[1] / "dist"
VIAS = {"rua": "Rua", "r.": "Rua", "avenida": "Avenida", "av.": "Avenida",
        "estrada": "Estrada", "travessa": "Travessa", "alameda": "Alameda",
        "rodovia": "Rodovia", "viela": "Viela"}
VIA = re.compile(r"(?<!\w)(" + "|".join(map(re.escape, VIAS)) + r")\s+", re.I)
BAIRRO_EXPLICITO = re.compile(r"\bbairro\s+(?:do\s+|da\s+|de\s+)?", re.I)
BAIRRO_IMPLICITO = re.compile(
    r"(?:\b(?:no|na|do|da|ao|a[oà]|para o|para a)\s+|,\s+)"
    r"(?=(?:Jardim|Vila|Residencial|Loteamento|Conjunto (?:Habitacional|Residencial)|Parque(?!\s+infantil)|Distrito|Centro)\b|Jd\.)", re.I
)
FIM_NOME = re.compile(
    r"[,;:!?()“”\"\n–—]|\s+-\s+|\.(?=\s*(?:$|[A-ZÁ-Ü][a-zá-ü]+\s+(?:o|a|para|que|na|no)\b))"
    r"|\s+(?:n[º°]|n\.?[oº°]?\s+(?=\d)|n[uú]mero|numeral|(?:na )?altura|no alcance|defronte|aproximad\w*|em frente\b|"
    r"pr[oó]xim[oa]\b|(?:nas )?proximidades|esquina|cruzamento|localizad\w*|situad\w*|"
    r"entre (?:a|as|o|os)\b|com (?:a|as|o|os) (?:rua|avenida|av\.|estrada)\b|"
    r"(?:no|na|do|da|ao) (?:bairro|jardim|vila|residencial|parque|loteamento|conjunto (?:habitacional|residencial)|centro|munic[ií]pio)\b|(?:no|na|do|da|ao) jd\.|"
    r"neste munic[ií]pio\b|em araras\b|em toda\b|em ambos\b|nas imedia[cç][oõ]es\b|"
    r"no trecho\b|at[eé] (?:a|o|as|os)\b|e (?:adjac[eê]ncias|entorno|imedia[cç][oõ]es|na rua|na avenida)\b)", re.I
)
GENERICOS = re.compile(r"^(?:de acesso|ao lado|atras|defronte|deste|desse|sem nome|sem denominacao|publica|do bairro|desta cidade|a ser|e sua|nos bairros|e adjacencias|da cidade|na altura)(\b|$)")
TEMA_POR_TEXTO = {
    "Tapa-buraco": r"\btapa[ -]?buracos?\b|\btapar (?:os )?buracos\b|\breparos? asfaltic\w+\b|\bremendo asfaltic\w+\b",
    "Recapeamento": r"\brecape\w+\b",
    "Pavimentação": r"\bpavimentacao\b|\basfaltamento\b",
    "Poda de árvores": r"\bpoda\b.{0,28}\b(?:arvore\w*|galho\w*)\b|\bpodar\b.{0,22}\barvore\w*\b",
    "Corte de mato e roçagem": r"\b(?:rocag\w+|capin\w+|corte (?:de|do) (?:mato|grama)|poda de mato|mato alto)\b",
    "Remoção de árvores": r"\b(?:supressao|retirada|remocao|extracao)\b.{0,26}\barvore\w*\b",
    "Iluminação pública": r"\biluminacao (?:publica|da via|da rua|da avenida)\b|\b(?:troca|substituicao|manutencao|instalacao)\b.{0,30}\b(?:lampada\w*|luminaria\w*)\b|\blampadas? queimad\w+\b",
    "Lombadas e redutores": r"\b(?:instal\w+|implant\w+|constr\w+|inclusao|coloca\w+)\b.{0,80}\b(?:lombada\w*|redutor\w* de velocidade)\b|\bredutor\w* de velocidade\b",
    "Sinalização de trânsito": r"\bsinalizacao\b|\bpintura\b.{0,35}\b(?:lombada\w*|faixa\w*|sinal\w*|pare)\b|\bplacas? de (?:pare|transito|proibido estacionar)\b",
    "Faixa de pedestres": r"\bfaixa\w* de pedestre\w*\b|\btravessia elevada\b",
    "Semáforos": r"\bsemaforo\w*\b|\bsinal semaforic\w*\b",
    "Bueiros e drenagem": r"\b(?:bueiro\w*|drenagem|boca\w* de lobo|sarjeta\w*|sarjetao)\b",
    "Limpeza de espaços públicos": r"\blimpeza\b.{0,44}\b(?:via\w*|rua\w*|area verde|espaco publico|praca\w*|canteiro\w*|terreno\w*)\b",
    "Retirada de lixo e entulho": r"\b(?:retirada|recolhimento|remocao|coleta)\b.{0,38}\b(?:entulho|lixo|residuos)\b",
    "Calçadas e acessibilidade": r"\b(?:calcada\w*|passeio publico|guia rebaixada|rampa de acessibilidade)\b",
    "Pontos de ônibus": r"\b(?:ponto\w*|abrigo\w*) (?:de|para|do) onibus\b",
    "Rede de água e esgoto": r"\b(?:rede de esgoto|vazamento de agua|rede de agua|abastecimento de agua|esgoto a ceu aberto)\b",
    "Segurança e patrulhamento": r"\b(?:ronda\w*|patrulhamento|policiamento|camera\w* de monitoramento)\b",
    "Equipamentos de praças": r"\b(?:parquinho\w*|playground|brinquedo\w*)\b",
}
TEMAS = {nome: re.compile(expressao) for nome, expressao in TEMA_POR_TEXTO.items()}
PREPOSICOES = {"a", "e", "da", "de", "do", "das", "dos"}
# As pautas registram as duas grafias para os mesmos endereços, inclusive no mesmo número.
# https://araras.siscam.com.br/arquivo?Id=181679 e https://araras.siscam.com.br/arquivo?Id=217808
ALIAS_VIAS = {"rua pedro de melo": "rua pedro de mello", "avenida irineu carrocci": "avenida irineu carroci"}


def normalizar(texto):
    letras = normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", letras).split())


def titulo(texto):
    palavras = texto.split()
    return " ".join(p.lower() if i and p.lower() in PREPOSICOES else p.upper() if re.fullmatch(r"[ivx]+", p, re.I)
                    else p[0].upper() + p[1:].lower() for i, p in enumerate(palavras))


def nome_na_ementa(resto):
    resto = re.sub(r"\b(dr|dra|prof|profa|eng|gov|dep|ver|pe)\.(?=\s)", r"\1", resto, flags=re.I)
    nome = FIM_NOME.split(resto, maxsplit=1)[0].strip(" .-/'’")
    nome = re.sub(r"(?<=\D)\s+\d{2,5}$", "", nome).strip()
    base = normalizar(nome)
    if not base or len(nome) > 76 or len(base.split()) > 9 or GENERICOS.match(base):
        return ""
    return nome


def endereco_chave(nome):
    nome = normalizar(nome)
    nome = re.sub(r"\b(?:doutor|doutora)\b", lambda m: "dra" if m[0].endswith("a") else "dr", nome)
    nome = re.sub(r"\bprofessor\b", "prof", nome)
    nome = re.sub(r"\bprofessora\b", "profa", nome)
    nome = re.sub(r"\b0+(?=\d)", "", nome)
    return ALIAS_VIAS.get(nome, nome)


def bairro_chave(nome):
    chave = normalizar(nome)
    romanos = {"1": "i", "2": "ii", "3": "iii", "4": "iv", "5": "v"}
    return re.sub(r"(?<= )([1-5])$", lambda m: romanos[m[1]], chave)


def enderecos(ementa):
    ruas = {}
    for marca in VIA.finditer(ementa):
        nome = nome_na_ementa(ementa[marca.end():])
        if nome:
            rotulo = titulo(f"{VIAS[marca[1].lower()]} {nome}")
            ruas[endereco_chave(rotulo)] = rotulo
    bairros = {}
    for marca in [*BAIRRO_EXPLICITO.finditer(ementa), *BAIRRO_IMPLICITO.finditer(ementa)]:
        nome = nome_na_ementa(ementa[marca.end():])
        nome = re.sub(r"^jd\.\s*", "Jardim ", nome, flags=re.I)
        if nome and not re.match(r"^(?:rua|avenida|arara[s]?|(?:local|acima)\b)", normalizar(nome)):
            bairros[bairro_chave(nome)] = titulo(nome)
    return ruas, bairros


def agrupar_bairros(bairros):
    conhecidos = set(bairros)
    nomes_simples = defaultdict(set)
    for chave in conhecidos:
        simples = re.sub(r"^(?:jardim|residencial|vila|loteamento) ", "", chave)
        if simples != chave:
            nomes_simples[simples].add(chave)
    return {simples: next(iter(nomes)) for simples, nomes in nomes_simples.items() if len(nomes) == 1 and simples in conhecidos}


def ler_propostas():
    pedidos = {}
    for arquivo in sorted((PASTA / "propostas").glob("*.json")):
        autor, grupo = arquivo.stem.split("-", 1)
        for linha in json.loads(arquivo.read_text(encoding="utf-8")):
            identificador = str(linha["id"])
            if identificador not in pedidos:
                ruas, bairros = enderecos(linha["assunto"])
                texto = normalizar(linha["assunto"])
                temas = [nome for nome, regra in TEMAS.items() if regra.search(texto)]
                pedidos[identificador] = {"id": identificador, "titulo": linha["titulo"], "data": linha["data"],
                                          "assunto": linha["assunto"], "grupo": grupo, "autores": [],
                                          "ruas": ruas, "bairros": bairros, "temas": temas}
            pedido = pedidos[identificador]
            if pedido["grupo"] != grupo:
                raise ValueError(f"Grupo divergente para a proposta {identificador}")
            pedido["autores"].append(autor)
    return sorted(pedidos.values(), key=lambda p: (p["data"], int(p["id"])), reverse=True)


def montar_indice(pedidos):
    nomes = defaultdict(Counter)
    por_lugar = Counter()
    bairros_por_rua = defaultdict(set)
    aliases = agrupar_bairros(chave for p in pedidos for chave in p["bairros"])
    for pedido in pedidos:
        for tipo in ("rua", "bairro"):
            campo = tipo + "s"
            originais = pedido[campo]
            chaves = set()
            for chave, nome in originais.items():
                canonica = aliases.get(chave, chave) if tipo == "bairro" else chave
                chave_final = f"{tipo}:{canonica}"
                if canonica == chave:
                    nomes[chave_final][nome] += 1
                chaves.add(chave_final)
            pedido[campo] = sorted(chaves)
            por_lugar.update(chaves)
        if len(pedido["ruas"]) == 1 and len(pedido["bairros"]) == 1:
            bairros_por_rua[pedido["ruas"][0]].add(pedido["bairros"][0])

    lugares = [{"key": chave, "nome": nomes[chave].most_common(1)[0][0], "tipo": chave.split(":")[0], "total": total}
               for chave, total in por_lugar.most_common()]
    rotulos = {lugar["key"]: lugar["nome"] for lugar in lugares}
    cruzamentos = defaultdict(list)
    for pedido in pedidos:
        # Registros que citam várias ruas não permitem atribuir o serviço a uma delas com segurança.
        if len(pedido["ruas"]) != 1 or len(pedido["bairros"]) > 1 or pedido["grupo"] in {"homenagens", "leis"}:
            continue
        if pedido["grupo"] == "outros" and not normalizar(pedido["titulo"]).startswith("indicacao "):
            continue
        rua = pedido["ruas"][0]
        bairro = next(iter(pedido["bairros"]), "")
        bairros = bairros_por_rua[rua]
        numerica = bool(re.match(r"rua:rua \d", rua))
        if not bairro and (numerica or len(bairros) > 1):
            continue
        if not numerica and len(bairros) == 1:
            bairro = next(iter(bairros))
        for tema in pedido["temas"]:
            rotulo = f"Informações sobre {tema.lower()}" if pedido["grupo"] == "perguntas" else tema
            cruzamentos[(rua, bairro, rotulo)].append(pedido["id"])

    recorrencias = []
    for (rua, bairro, tema), ids in sorted(cruzamentos.items(), key=lambda item: (-len(item[1]), item[0])):
        if len(ids) >= 2:
            recorrencias.append({"id": str(len(recorrencias) + 1), "rua": rotulos[rua], "bairro": rotulos.get(bairro),
                                 "ruaKey": rua, "bairroKey": bairro, "tema": tema, "pedidos": ids})
    return lugares, recorrencias


def gravar(nome, dados, prefixo="", sufixo="\n"):
    (PASTA / nome).write_text(prefixo + json.dumps(dados, ensure_ascii=False, separators=(",", ":")) + sufixo, encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destino", type=Path, default=PASTA)
    args = parser.parse_args()
    PASTA = args.destino
    pedidos = ler_propostas()
    lugares, repetidos = montar_indice(pedidos)
    gravar("territorio.json", {"pedidos": pedidos, "lugares": lugares, "repetidos": repetidos})
    resumo = {"total": len(pedidos), "porGrupo": dict(Counter(p["grupo"] for p in pedidos)),
              "bairros": [lugar for lugar in lugares if lugar["tipo"] == "bairro"][:8], "repeticoes": len(repetidos),
              "aliasVias": ALIAS_VIAS}
    gravar("territorio-resumo.js", resumo, "globalThis.ARARAS_TERRITORIO_RESUMO = ", ";\n")
    print(f"{len(pedidos)} propostas, {len(lugares)} lugares, {len(repetidos)} grupos recorrentes")
