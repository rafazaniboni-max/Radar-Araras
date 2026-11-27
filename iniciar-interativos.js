'use strict';

// O HTML já contém os dados legíveis. A busca e os filtros são carregados perto do uso.
(() => {
  const lista = JSON.parse(document.querySelector('#scripts-interativos')?.textContent || '[]');
  let carregamento;
  function carregar() {
    if (carregamento) return carregamento;
    carregamento = new Promise((resolve, reject) => {
      const aplicativo = lista.at(-1);
      const dependencias = lista.slice(0,-1);
      let restantes = dependencias.length;
      if (!aplicativo) { resolve(); return; }
      const iniciarAplicativo = () => {
        const script = document.createElement('script');
        script.src = aplicativo;
        script.onload = resolve;
        script.onerror = () => reject(Error('Não foi possível iniciar a consulta interativa.'));
        document.head.append(script);
      };
      if (!restantes) iniciarAplicativo();
      for (const src of dependencias) {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = () => { if (--restantes === 0) iniciarAplicativo(); };
        script.onerror = () => reject(Error('Não foi possível carregar a consulta interativa.'));
        document.head.append(script);
      }
    });
    carregamento.catch(() => {
      const resultado = document.querySelector('#resultado-local');
      if (resultado) resultado.innerHTML = '<p class="notice">A busca interativa não carregou. Recarregue a página ou <a href="/bairros-e-ruas/locais/">consulte as páginas dos locais</a>.</p>';
    });
    return carregamento;
  }
  const observer = new IntersectionObserver(entradas => {
    if (entradas.some(e=>e.isIntersecting)) { observer.disconnect(); carregar(); }
  }, {rootMargin:'200px'});
  for (const seletor of ['#ranking-cidade','#bairros','#vereadores','#propostas','#repetidos']) {
    const alvo = document.querySelector(seletor);
    if (alvo) observer.observe(alvo);
  }
  document.addEventListener('focusin', event => {
    if (event.target.closest('#busca-local,.people-filters,#busca,#filtro-partido,#ordem-vereadores')) carregar();
  });
  document.addEventListener('submit', event => {
    if (document.documentElement.dataset.interativosProntos === '1' || event.target.id !== 'busca-local') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    carregar().then(()=>event.target.requestSubmit()).catch(()=>{});
  },true);
  document.addEventListener('click', event => {
    if (document.documentElement.dataset.interativosProntos === '1') return;
    const botao=event.target.closest('button[data-abrir-grupo],button[data-radar-lugar],button[data-abrir-repetido],button[data-mais-repetidos],button[data-ranking-grupo],button[data-ranking-completo]');
    if (!botao) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    carregar().then(()=>botao.isConnected && botao.click()).catch(()=>{});
  },true);
})();
