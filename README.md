# Radar Araras

Site com dados oficiais da Câmara Municipal de Araras/SP desde 1º de janeiro de 2025.

A rotina em `.github/workflows/atualizar-site.yml` coleta sessões, presença, votos, propostas de cada autor, atas, contratos, execução de despesas e os arquivos mensais do TCE-SP. A publicação diária está programada para 03h17 no horário de São Paulo. Também pode ser iniciada em Actions, pelo botão Run workflow.

O GitHub Pages precisa estar configurado para publicar por GitHub Actions nas configurações do repositório. A publicação usa a pasta candidata produzida pela coleta. O endereço segue o padrão do GitHub Pages para este repositório.

O workflow manual Publicar a última versão boa permite a primeira publicação ou a restauração dos arquivos de referência já conferidos. Ele utiliza `dist`. A rotina diária utiliza exclusivamente a nova coleta aprovada. Assim, uma fonte temporariamente incompleta preserva a publicação anterior.

Uma falha de rede, página incompleta, perda de documentos anteriores, aumento inesperado ou divergência entre os arquivos interrompe a execução antes do envio ao Pages. O site publicado continua com a versão anterior. O relatório de cada tentativa fica nos artefatos da execução por 30 dias. A versão publicada também inclui `atualizacao.json`, com datas, totais e hashes dos arquivos conferidos.

As regras de bloqueio estão em `scripts/validar-atualizacao.py`. A conferência compara a coleta com a versão de referência em `dist`. Recuos de valores exigem investigação porque também podem resultar de retificações oficiais. Documentos isolados não localizados ficam preservados no histórico; quedas grandes e fontes incompletas continuam bloqueadas. Quando a lista de um autor perde muitos registros, o coletor confere a pesquisa oficial paginada antes da validação. A rotina só substitui a referência depois que a publicação termina com sucesso.

A exportação Betha repete falhas temporárias de rede, espera a geração do arquivo e identifica conjunto e exercício em cada falha. `raw/diagnostico-financeiro.json` e `raw/atas/diagnostico.json` acompanham o relatório nos artefatos do GitHub. Não são registrados tokens ou URLs de download assinadas. A conferência financeira passa a guardar os pagamentos por empenho: campos sem valor e sem parcelas ficam identificados, sem serem convertidos em zero. Perda de pagamentos anteriores, soma divergente ou parcela sem valor consolidado continuam impedindo a publicação. O primeiro ciclo com essa conferência também preserva as verificações dos totais da referência anterior.

Uma base aprovada recebe URLs de dados versionadas para evitar que o navegador exiba arquivos de uma coleta anterior. A data da consulta é separada da data do último pagamento ou documento efetivamente publicado pela fonte.

Para executar a mesma coleta localmente, instale Python 3.12, Node.js 24 e as bibliotecas de `requirements.txt`. Execute `python scripts/testar-validacao.py` e `python scripts/atualizar-site.py`. A coleta candidata e o relatório ficam em `.build/atualizacao`. Esses comandos preservam os arquivos de referência.

O projeto também mantém o servidor utilizado na hospedagem Sites. Para montar esse servidor, execute `node scripts/montar-servidor.mjs`. O GitHub Pages utiliza os arquivos estáticos da coleta validada.

Para preparar o pacote da Hostinger, execute `python scripts/empacotar-hostinger.py`. O arquivo `.build/hostinger/radar-araras.zip` contém os arquivos públicos de `dist`, com `index.html` na raiz e sem o servidor da hospedagem Sites. O pacote usa a última versão de referência; uma coleta rejeitada não substitui esses dados. Extraia o conteúdo na pasta pública do domínio `radarararas.com.br`.

O código do AdSense com o identificador `ca-pub-2804798076254345` fica uma única vez no `<head>` de `dist/index.html`, compartilhado por todas as telas do site.

Após uma coleta aprovada, a rotina diária também atualiza a branch `codex/site-publicado` com somente os arquivos públicos de `dist`. Essa branch deve ser selecionada na integração Git da Hostinger, com destino `public_html` e publicação automática ativa. Uma coleta rejeitada não altera essa branch. A conexão oficial da Hostinger com o GitHub deve estar autorizada somente para o repositório Radar-Araras.
