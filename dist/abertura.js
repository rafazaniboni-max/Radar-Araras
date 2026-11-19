'use strict';
(() => {
function tempoDesdeConferencia(data, agora = Date.now()) {
  const instante = Date.parse(data);
  if (!Number.isFinite(instante) || !Number.isFinite(agora) || instante - agora > 60000) return null;
  const minutos = Math.floor(Math.max(0, agora - instante) / 60000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} minuto${minutos === 1 ? '' : 's'}`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} hora${horas === 1 ? '' : 's'}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias === 1 ? '' : 's'}`;
}
function estimarSalarios(dados, agora = Date.now()) {
  const pago = dados?.totais?.vereadores;
  const inicio = Date.parse(`${dados?.inicio}T00:00:00-03:00`);
  const fim = Date.parse('2029-01-01T00:00:00-03:00');
  const referencia = Math.min(Date.parse(dados?.consultadoEm), fim);
  if (!Number.isSafeInteger(pago) || pago <= 0 || !Number.isFinite(inicio)
      || !Number.isFinite(referencia) || referencia <= inicio || !Number.isFinite(agora)) return null;
  const taxa = pago / ((referencia - inicio) / 1000);
  const segundos = Math.max(0, (Math.min(agora, fim) - referencia) / 1000);
  return { valor: Math.floor(pago + taxa * segundos), taxa };
}

  const dados = JSON.parse(document.querySelector('#dados-abertura').textContent);
  const formato = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  let relogio;
  function contador() {
    if (document.documentElement.dataset.interativosProntos === '1') { clearInterval(relogio); return; }
    const alvo = document.querySelector('[data-contador-salarios]');
    const estimativa = estimarSalarios(dados);
    if (alvo && estimativa) {
      const valor = formato.format(estimativa.valor / 100);
      alvo.textContent = valor;
      alvo.setAttribute('aria-label','Salários desde a posse, estimativa em tempo real '+valor);
    }
  }
  contador();
  relogio = setInterval(contador,1000);
  const selo = document.querySelector('[data-status-coleta]');
  const texto = selo?.querySelector('[data-status-texto]');
  fetch('/atualizacao.json?v='+document.documentElement.dataset.coleta,{cache:'no-store'})
    .then(r=>{if(!r.ok)throw Error();return r.json();}).then(r=>{
      if (!texto) return;
      if (r.aprovado!==true || r.fim!==dados.fim || r.verificacoes?.revisao!==document.documentElement.dataset.coleta) {
        texto.textContent='nova conferência disponível · atualize a página'; return;
      }
      let intervalo;
      function atualizar() {
        if (document.documentElement.dataset.interativosProntos==='1') {clearInterval(intervalo);return;}
        const tempo=tempoDesdeConferencia(r.concluidoEm);
        texto.textContent=tempo?'dados conferidos '+tempo:'confira a última atualização em Fontes';
        if(tempo) {
          texto.dateTime=r.concluidoEm;
          selo.title='Conferência concluída em '+new Intl.DateTimeFormat('pt-BR',{dateStyle:'long',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(r.concluidoEm))+'. A coleta é diária; consulte as fontes e os limites.';
        }
      }
      atualizar(); intervalo=setInterval(atualizar,60000);
    }).catch(()=>{if(texto)texto.textContent='confira a última atualização em Fontes';});
})();
