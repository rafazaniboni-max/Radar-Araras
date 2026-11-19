"""Confere a coleta candidata contra os arquivos da última versão validada."""

from collections import Counter
from datetime import date
import hashlib
import json
from pathlib import Path
import re


ARQUIVOS = {
    "legislativo": ("legislativo.js", "ARARAS_LEGISLATIVO"),
    "propostas": ("propostas.js", "ARARAS_PROPOSTAS"),
    "territorio": ("territorio-resumo.js", "ARARAS_TERRITORIO_RESUMO"),
    "financas": ("financas.js", "ARARAS_FINANCAS"),
    "pagamentos": ("pagamentos.js", "ARARAS_PAGAMENTOS"),
    "auditoria": ("auditoria-presencas.js", "ARARAS_AUDITORIA_PRESENCAS"),
}


def ler_dados(pasta, arquivo, variavel):
    conteudo = (Path(pasta) / arquivo).read_text(encoding="utf-8-sig")
    atribuicao = re.fullmatch(r"\s*globalThis\." + re.escape(variavel) + r"\s*=\s*(.*);\s*", conteudo, re.S)
    if not atribuicao:
        raise ValueError(f"Formato inválido em {arquivo}")
    return json.loads(atribuicao[1])


def carregar(pasta):
    return {nome: ler_dados(pasta, arquivo, variavel) for nome, (arquivo, variavel) in ARQUIVOS.items()}


def exigir(condicao, mensagem):
    if not condicao:
        raise ValueError(mensagem)


def documentos(pasta, perfis):
    unicos = {}
    for autor, perfil in perfis.items():
        exigir(perfil.get("completo") is True, f"Propostas incompletas para o autor {autor}.")
        soma = 0
        for grupo, total in perfil["grupos"].items():
            arquivo = Path(pasta) / "propostas" / f"{autor}-{grupo}.json"
            linhas = json.loads(arquivo.read_text(encoding="utf-8")) if arquivo.exists() else []
            exigir(len(linhas) == total, f"Contagem divergente para {autor}/{grupo}.")
            exigir(len({str(linha['id']) for linha in linhas}) == total, f"Documentos duplicados em {autor}/{grupo}.")
            soma += total
            for linha in linhas:
                identificador = str(linha["id"])
                exigir(linha["url"] == f"https://araras.siscam.com.br/Documentos/Documento/{identificador}", "Proposta sem fonte oficial.")
                if identificador in unicos:
                    exigir(unicos[identificador][0] == grupo, f"Classificação divergente em {identificador}.")
                unicos[identificador] = (grupo, linha)
        exigir(soma == perfil["total"], f"Total divergente para o autor {autor}.")
    return unicos


def conferir_empenhos(anterior, atual):
    """Campos vazios sem parcelas não são tratados como pagamento zero nem como perda automática."""
    if atual.get('conferenciaVersao') != 1:
        exigir(anterior.get('conferenciaVersao') != 1, 'A conferência individual dos empenhos desapareceu.')
        exigir(atual['semValor'] <= anterior['semValor'], 'Aumentou a quantidade de pagamentos sem valor e sem identificação.')
        return
    registros = atual.get('empenhosConferidos')
    detalhes = atual.get('semValorDetalhes')
    exigir(isinstance(registros, dict) and bool(registros), 'Conferência de empenhos vazia.')
    exigir(isinstance(detalhes, list), 'Empenhos sem valor não foram identificados.')
    ausentes = {r['empenho']: r for r in detalhes}
    exigir(len(ausentes) == len(detalhes) == atual['semValor'], 'Contagem de empenhos sem valor divergente.')
    nulos = set()
    somas = {grupo: 0 for grupo in atual['totais']}
    for id, registro in registros.items():
        exigir(re.fullmatch(r'\d+/\d{4}', id) is not None, 'Identificador de empenho inválido.')
        exigir(str(registro.get('ano')) == id.split('/')[1], f'Exercício divergente no empenho {id}.')
        exigir(registro.get('grupo') in atual['totais'], f'Grupo inválido no empenho {id}.')
        data = registro.get('dataEmpenho', '')
        exigir(isinstance(data, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', data) is not None and data <= atual['fim'], f'Data inválida no empenho {id}.')
        parcelas = registro.get('parcelasDivulgadas')
        exigir(type(parcelas) is int and parcelas >= 0, f'Parcelas inválidas no empenho {id}.')
        valor = registro.get('valorPagoCentavos')
        if valor is None:
            nulos.add(id)
            detalhe = ausentes.get(id, {})
            exigir(parcelas == 0 and detalhe.get('parcelasDivulgadas') == 0 and detalhe.get('dataEmpenho') == data,
                   f'Valor pago ausente sem explicação no empenho {id}.')
            exigir(registro.get('pagoNoRecorteCentavos') is None, f'Valor desconhecido convertido em zero no empenho {id}.')
        else:
            exigir(type(valor) is int and valor >= 0, f'Valor pago inválido no empenho {id}.')
            periodo = registro.get('pagoNoRecorteCentavos')
            exigir(type(periodo) is int and 0 <= periodo <= valor, f'Valor do recorte inválido no empenho {id}.')
            somas[registro['grupo']] += periodo
    exigir(nulos == ausentes.keys(), 'Lista de empenhos sem valor divergente da conferência individual.')
    exigir(somas == atual['totais'], 'A soma da conferência dos empenhos diverge dos totais publicados.')
    for id, registro in anterior.get('empenhosConferidos', {}).items():
        pago = registro.get('valorPagoCentavos')
        if pago is not None and pago > 0:
            novo = registros.get(id, {}).get('valorPagoCentavos')
            exigir(type(novo) is int and novo >= pago, f'Pagamento anteriormente informado desapareceu ou diminuiu no empenho {id}.')


def validar(base, candidata, fim):
    anterior = carregar(base)
    atual = carregar(candidata)
    for nome in ["legislativo", "propostas", "financas", "pagamentos"]:
        exigir(atual[nome].get("inicio") == "2025-01-01", f"Início incorreto em {nome}.")
        exigir(atual[nome].get("fim") == fim, f"Data de coleta incorreta em {nome}.")
    pessoas = atual["legislativo"]["vereadores"]
    exigir(sum(p.get("emExercicio") is True for p in pessoas) == 11, "A lista oficial não contém os 11 vereadores em exercício.")
    exigir(all(p.get("id") for p in pessoas if p.get("emExercicio")), "Vereador em exercício sem identificador oficial.")
    antigas = {str(s["id"]): s for s in anterior["legislativo"]["sessoes"]}
    sessoes = {str(s["id"]): s for s in atual["legislativo"]["sessoes"]}
    exigir(len(sessoes) == len(atual["legislativo"]["sessoes"]), "Sessões duplicadas.")
    exigir(antigas.keys() <= sessoes.keys(), "Sessões anteriores desapareceram da coleta.")
    for identificador, sessao in sessoes.items():
        exigir("2025-01-01" <= sessao["data"] <= fim, "Sessão fora do período.")
        exigir(sessao["url"] == f"https://araras.siscam.com.br/Sessoes/Sessao/{identificador}", "Sessão sem fonte oficial.")
        velha = antigas.get(identificador)
        if velha:
            exigir(len(sessao["chamadas"]) >= len(velha["chamadas"]), f"Chamadas desapareceram da sessão {identificador}.")
            exigir(len(sessao["votacoes"]) >= len(velha["votacoes"]), f"Votações desapareceram da sessão {identificador}.")
            exigir(sum(len(c["registros"]) for c in sessao["chamadas"]) >= sum(len(c["registros"]) for c in velha["chamadas"]), f"Registros de presença desapareceram da sessão {identificador}.")
            exigir(sum(len(v["votos"]) for v in sessao["votacoes"]) >= sum(len(v["votos"]) for v in velha["votacoes"]), f"Votos desapareceram da sessão {identificador}.")
    perfis = atual["propostas"]["perfis"]
    exigir(anterior["propostas"]["perfis"].keys() <= perfis.keys(), "Autores anteriores desapareceram.")
    exigir(all(str(p["id"]) in perfis for p in pessoas if p.get("emExercicio")), "Há vereador em exercício sem coleta de propostas.")
    docs = documentos(candidata, perfis)
    docs_anteriores = documentos(base, anterior["propostas"]["perfis"])
    ausentes = sorted(docs_anteriores.keys() - docs.keys())
    exigir(not ausentes, f"Propostas anteriores desapareceram. Identificadores oficiais ausentes: {', '.join(ausentes[:20])}.")
    # A preservação é explícita e cumulativa; remover a trava sem reconciliar continua proibido.
    from importlib.util import module_from_spec, spec_from_file_location
    spec = spec_from_file_location('historico_validado', Path(__file__).with_name('historico-documentos.py'))
    historico = module_from_spec(spec)
    spec.loader.exec_module(historico)
    historico.validar_historico(base, candidata)
    dias = max(1, (date.fromisoformat(fim) - date.fromisoformat(anterior["propostas"]["fim"])).days)
    exigir(len(docs) - len(docs_anteriores) <= 300 * dias, "Aumento inesperado de propostas. A coleta precisa de revisão.")
    exigir(all("2025-01-01" <= linha["data"] <= fim for _, linha in docs.values()), "Proposta fora do período.")
    territorio = json.loads((Path(candidata) / "territorio.json").read_text(encoding="utf-8"))
    exigir({str(p["id"]) for p in territorio["pedidos"]} == docs.keys(), "O índice de bairros não corresponde às propostas.")
    exigir(atual["territorio"]["total"] == len(docs), "Total de propostas divergente no resumo.")
    exigir(dict(Counter(grupo for grupo, _ in docs.values())) == atual["territorio"]["porGrupo"], "Totais dos grupos divergentes.")
    for repetido in territorio["repetidos"]:
        exigir(len(set(repetido["pedidos"])) >= 2 and set(repetido["pedidos"]) <= docs.keys(), "Agrupamento de pedidos repetidos inválido.")
    pagamentos = atual["pagamentos"]
    for grupo, valor in pagamentos["totais"].items():
        antigo = anterior["pagamentos"]["totais"][grupo]
        exigir(type(valor) is int and valor >= antigo, f"Pagamento de {grupo} diminuiu ou ficou inválido.")
        exigir(valor - antigo <= max(100_000_000, antigo // 4) * dias, f"Aumento financeiro inesperado em {grupo}.")
        exigir(sum(ano[grupo] for ano in pagamentos["porAno"].values()) == valor, f"Totais anuais divergentes em {grupo}.")
    conferir_empenhos(anterior['pagamentos'], pagamentos)
    contratos = atual["financas"]["contratos"]["lista"]
    exigir({r["numero"] for r in anterior["financas"]["contratos"]["lista"]} <= {r["numero"] for r in contratos}, "Contratos anteriores desapareceram.")
    meses = {m["periodo"]: m for m in atual["financas"]["despesas"]}
    for mes in anterior["financas"]["despesas"]:
        exigir(mes["periodo"] in meses, f"As despesas de {mes['periodo']} desapareceram.")
        if mes["nomeFonte"] == "TCE-SP":
            exigir(meses[mes["periodo"]]["nomeFonte"] == "TCE-SP", f"O arquivo do TCE-SP de {mes['periodo']} ficou indisponível.")
    auditoria = atual["auditoria"]
    exigir(auditoria["recorte"] == fim, "A conferência das atas não foi atualizada.")
    exigir(sum(auditoria["totais"].values()) == len(sessoes), "Auditoria de presença incompleta.")
    exigir(auditoria["totais"].get("ata_ambigua", 0) <= anterior["auditoria"]["totais"].get("ata_ambigua", 0), "A leitura das atas ficou ambígua.")
    for identificador in anterior["auditoria"]["sessoes"]:
        exigir(identificador in auditoria["sessoes"], f"Ata anteriormente disponível desapareceu da sessão {identificador}.")
    hashes = {str(p.relative_to(candidata)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in sorted(Path(candidata).rglob('*')) if p.is_file() and p.name != 'atualizacao.json'}
    return {"vereadoresEmExercicio": 11, "sessoes": len(sessoes), "sessoesAnteriores": len(antigas),
            "propostas": len(docs), "propostasAnteriores": len(docs_anteriores), "contratos": len(contratos),
            "mesesDespesas": len(meses), "pagamentosCentavos": pagamentos["totais"],
            "presencaConferida": auditoria["totais"], "sha256": hashes}
