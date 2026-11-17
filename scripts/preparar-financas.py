import argparse
import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path


PROJETO = Path(__file__).resolve().parents[1]
AMOSTRAS = PROJETO.parent / "amostras-araras"
ORGAO_TC = "CÂMARA MUNICIPAL DE ARARAS"
ORGAO_BETHA = "CAMARA MUNICIPAL DE ARARAS"
BETHA = "https://transparencia.betha.cloud/#/3EqrsBn0TZZ9CBAkiNBwSw==/dados-abertos"


def ler_json(nome):
    return json.loads((AMOSTRAS / nome).read_text(encoding="utf-8-sig"), parse_float=Decimal)


def centavos(valor):
    valor = Decimal(valor) * 100
    if valor != valor.to_integral_value():
        raise ValueError(f"Valor com precisão inferior a um centavo: {valor}")
    return int(valor)


def resumo(periodo, fonte, fornecedor, eventos):
    totais = {}
    pagamentos = []
    for evento, data, empenho, credor, valor in eventos:
        totais[evento] = totais.get(evento, 0) + valor
        if evento == "Valor Pago":
            pagamentos.append({"data": data, "empenho": empenho, "fornecedor": credor, "valor": valor})
    pagamentos.sort(key=lambda registro: registro["data"], reverse=True)
    return {
        "periodo": periodo, "fonte": fonte, "nomeFonte": fornecedor,
        "ultimaData": max(evento[1] for evento in eventos),
        "totalPago": totais.get("Valor Pago", 0),
        "totalLiquidado": totais.get("Valor Liquidado", 0),
        "totalEmpenhado": totais.get("Empenhado", 0),
        "pagamentos": pagamentos,
    }


def despesas_tce(periodo, inicio, fim):
    ano, mes = periodo.split("-")
    url = f"https://transparencia.tce.sp.gov.br/api/json/despesas/araras/{ano}/{int(mes)}"
    eventos = []
    for registro in ler_json(f"tcesp-desde-2025/{periodo}.json"):
        if registro["orgao"] != ORGAO_TC:
            continue
        data = datetime.strptime(registro["dt_emissao_despesa"], "%d/%m/%Y").date().isoformat()
        if inicio <= data <= fim:
            valor = centavos(registro["vl_despesa"].replace(".", "").replace(",", "."))
            eventos.append((registro["evento"], data, registro["nr_empenho"], registro["nm_fornecedor"], valor))
    return resumo(periodo, url, "TCE-SP", eventos) if eventos else {"periodo": periodo, "fonte": url}


def despesas_betha(periodo, inicio, fim):
    ano = periodo[:4]
    arquivo = AMOSTRAS / f"betha-execucao-despesas-{ano}.json"
    if not arquivo.is_file():
        return None
    eventos = []
    for empenho in ler_json(arquivo):
        if empenho["nomeEntidade"] != ORGAO_BETHA:
            continue
        numero = f"{empenho['numeroEmpenho']}/{empenho['anoCadastro']}"
        credor = (empenho.get("credor") or {}).get("nomeCredor")
        etapas = [("Empenhado", empenho["dataEmpenho"], empenho["valorEmpenho"])]
        etapas.extend(("Valor Liquidado", r["data"], r["valor"]) for r in empenho.get("liquidacoes") or [])
        etapas.extend(("Valor Pago", r["dataPagamento"], r["valorPagamento"]) for r in empenho.get("pagamentos") or [])
        eventos.extend((evento, data, numero, credor, centavos(valor)) for evento, data, valor in etapas
                       if data and data.startswith(periodo) and inicio <= data <= fim)
    return resumo(periodo, BETHA, "Portal da Câmara (Betha)", eventos) if eventos else None


def contratos(inicio, fim):
    anos = list(range(int(inicio[:4]), int(fim[:4]) + 1))
    registros = [r for ano in anos for r in ler_json(f"betha-contratos-{ano}.json")
                 if r["nomeEntidade"] == ORGAO_BETHA and r["ano"] == ano and inicio <= r["dataAssinatura"] <= fim]
    registros.sort(key=lambda registro: (registro["dataAssinatura"], int(registro["numero"])), reverse=True)
    return {"anos": anos, "fonte": BETHA, "lista": [
            {
                "ano": r["ano"],
                "numero": f"{r['numero']}/{r['ano']}",
                "fornecedor": r["nomeContratado"],
                "objeto": r["objeto"],
                "inicio": r["dataVigenciaInicial"],
                "fim": r["dataVigenciaFinal"],
                "assinatura": r["dataAssinatura"],
                "valor": centavos(r["valorFinal"]),
                "situacao": "Em execução" if r["situacao"] == "EXECUCAO" else r["situacao"],
                "fonte": BETHA,
            }
            for r in registros
        ]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepara os dados oficiais das contas da Câmara.")
    parser.add_argument("--inicio", default="2025-01-01", type=lambda texto: date.fromisoformat(texto).isoformat())
    parser.add_argument("--fim", required=True, type=lambda texto: date.fromisoformat(texto).isoformat())
    parser.add_argument("--origem", type=Path, default=AMOSTRAS)
    parser.add_argument("--destino", type=Path, default=PROJETO / "dist")
    args = parser.parse_args()
    AMOSTRAS = args.origem
    dados = {"inicio": args.inicio, "fim": args.fim, "despesas": [], "lacunasDespesas": [],
             "contratos": contratos(args.inicio, args.fim)}
    anos = range(int(args.inicio[:4]), int(args.fim[:4]) + 1)
    periodos = [f"{ano}-{mes:02d}" for ano in anos for mes in range(1, 13)]
    for periodo in reversed(periodos):
        if not args.inicio[:7] <= periodo <= args.fim[:7]:
            continue
        tce = despesas_tce(periodo, args.inicio, args.fim)
        mes = tce if "pagamentos" in tce else despesas_betha(periodo, args.inicio, args.fim)
        if mes:
            dados["despesas"].append(mes)
        else:
            dados["lacunasDespesas"].append({**tce, "situacao": "Nenhum lançamento disponível neste mês nas fontes consultadas."})
    conteudo = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
    (args.destino / "financas.js").write_text(f"globalThis.ARARAS_FINANCAS = {conteudo};\n", encoding="utf-8")
