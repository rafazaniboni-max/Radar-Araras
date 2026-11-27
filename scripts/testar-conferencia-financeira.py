from copy import deepcopy
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import unittest

spec=spec_from_file_location('validacao',Path(__file__).with_name('validar-atualizacao.py'))
m=module_from_spec(spec);spec.loader.exec_module(m)


class ConferenciaFinanceira(unittest.TestCase):
    def dados(self):
        return {'fim':'2026-11-19','conferenciaVersao':1,'totais':{'vereadores':10000},'semValor':0,'semValorDetalhes':[],
                'empenhosConferidos':{'1/2026':{'ano':2026,'dataEmpenho':'2026-11-12','grupo':'vereadores',
                  'valorPagoCentavos':10000,'pagoNoRecorteCentavos':10000,'parcelasDivulgadas':1}}}

    def adicionar_sem_valor(self,dados):
        dados['semValor']=1
        dados['semValorDetalhes']=[{'empenho':'2/2026','dataEmpenho':'2026-11-13','parcelasDivulgadas':0}]
        dados['empenhosConferidos']['2/2026']={'ano':2026,'dataEmpenho':'2026-11-13','grupo':'vereadores',
            'valorPagoCentavos':None,'pagoNoRecorteCentavos':None,'parcelasDivulgadas':0}

    def test_novo_empenho_sem_parcelas_nao_bloqueia_so_por_aumentar_contagem(self):
        base=self.dados();nova=deepcopy(base);self.adicionar_sem_valor(nova)
        m.conferir_empenhos(base,nova)

    def test_sem_valor_sem_detalhes_continua_bloqueado(self):
        base=self.dados();nova=deepcopy(base);nova['semValor']=1
        with self.assertRaises(ValueError):m.conferir_empenhos(base,nova)

    def test_pagamento_anterior_perdido_continua_bloqueado(self):
        base=self.dados();nova=deepcopy(base)
        nova['empenhosConferidos']['2/2026']=nova['empenhosConferidos'].pop('1/2026')
        with self.assertRaisesRegex(ValueError,'desapareceu'):m.conferir_empenhos(base,nova)

    def test_total_incompativel_com_os_registros_e_bloqueado(self):
        base=self.dados();nova=deepcopy(base);nova['totais']['vereadores']+=1
        with self.assertRaisesRegex(ValueError,'soma'):m.conferir_empenhos(base,nova)

    def test_desconhecido_nao_pode_virar_zero(self):
        base=self.dados();nova=deepcopy(base);self.adicionar_sem_valor(nova)
        nova['empenhosConferidos']['2/2026']['pagoNoRecorteCentavos']=0
        with self.assertRaisesRegex(ValueError,'convertido em zero'):m.conferir_empenhos(base,nova)

    def test_ledger_nao_pode_sumir_na_coleta_seguinte(self):
        base=self.dados();nova={'semValor':0}
        with self.assertRaisesRegex(ValueError,'desapareceu'):m.conferir_empenhos(base,nova)

    def test_devolucao_publicada_justifica_reducao(self):
        base=self.dados();nova=deepcopy(base)
        nova['totais']['vereadores']=8000
        novo=nova['empenhosConferidos']['1/2026']
        novo.update(valorPagoCentavos=8000,pagoNoRecorteCentavos=8000,parcelasBrutasCentavos=10000,
                    anulacoesPagamento=[{'data':'2026-11-18','motivo':'Devolução do pagamento','valorCentavos':2000}])
        m.conferir_empenhos(base,nova)
        nova['totais']['vereadores']=7000
        novo.update(valorPagoCentavos=7000,pagoNoRecorteCentavos=7000)
        with self.assertRaises(ValueError):m.conferir_empenhos(base,nova)

    def test_devolucao_antiga_nao_justifica_nova_reducao(self):
        base=self.dados()
        base['empenhosConferidos']['1/2026']['anulacoesPagamento']=[
            {'data':'2026-11-18','motivo':'Devolução do pagamento','valorCentavos':2000}]
        nova=deepcopy(base);nova['totais']['vereadores']=8000
        nova['empenhosConferidos']['1/2026'].update(valorPagoCentavos=8000,pagoNoRecorteCentavos=8000)
        with self.assertRaises(ValueError):m.conferir_empenhos(base,nova)

if __name__=='__main__':unittest.main(verbosity=2)
