'use strict';

(() => {
  const rotas = globalThis.ARARAS_ROTAS || {};
  const raiz = document.documentElement;
  function destino(fragmento) {
    const chave = fragmento.replace(/^#/, '');
    if (rotas[chave]) return rotas[chave];
    if (chave.startsWith('bairros/')) {
      try { return `/bairros-e-ruas/?busca=${encodeURIComponent(decodeURIComponent(chave.slice(8)))}`; } catch { return '/bairros-e-ruas/'; }
    }
    return null;
  }
  function converterLinks() {
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      const url = destino(a.getAttribute('href'));
      if (url) a.setAttribute('href', url);
    });
  }
  function antiga() {
    const url = destino(location.hash);
    if (url && (location.pathname + location.search !== url || location.hash)) {
      location.replace(url);
      return true;
    }
    return false;
  }
  globalThis.ARARAS_NAVEGACAO = { converterLinks, destino };
  if (antiga()) return;
  window.addEventListener('hashchange', antiga);
  converterLinks();
  new MutationObserver(converterLinks).observe(document.querySelector('#painel'), { childList: true, subtree: true });
  if (raiz.dataset.interativo !== '1') {
    document.querySelector('#painel')?.addEventListener('click', event => {
      const button = event.target.closest('[data-more]');
      if (!button) return;
      const linhas = [...button.previousElementSibling.querySelectorAll('li[hidden]')];
      linhas.slice(0, 15).forEach(li => { li.hidden = false; });
      if (linhas.length <= 15) button.remove();
    });
    document.querySelector('#mes')?.addEventListener('change', event => {
      const url = destino(`contas/despesas/${event.target.value}`);
      if (url) location.assign(url);
    });
    document.querySelector('#ano-contratos')?.addEventListener('change', event => {
      const ano = event.target.value;
      location.assign(destino(`contas/contratos${ano ? `/${ano}` : ''}`) || '/contas-da-camara/contratos/');
    });
    const cabecalho = document.querySelector('.site-header');
    if (cabecalho) new ResizeObserver(() => raiz.style.setProperty('--cabecalho-altura', `${cabecalho.getBoundingClientRect().height}px`)).observe(cabecalho);
  }
  const form = document.querySelector('[data-busca-estatica]');
  if (form) form.addEventListener('submit', event => {
    event.preventDefault();
    const valor = new FormData(form).get('busca');
    location.assign(`/bairros-e-ruas/?busca=${encodeURIComponent(String(valor || ''))}`);
  });
})();
