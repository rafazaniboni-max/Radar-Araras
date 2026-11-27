'use strict';

// A leitura e a navegação funcionam com a abertura inteiramente estática.
(() => {
  const palco = document.querySelector('.radar-palco');
  if (!palco || !window.matchMedia || !window.IntersectionObserver) return;
  const abertura = palco.querySelector('.radar-abertura');
  const marca = palco.querySelector('.radar-logo img');
  const movimento = matchMedia('(prefers-reduced-motion: no-preference)');
  const mouse = matchMedia('(hover: hover) and (pointer: fine)');
  let visivel = false;
  let quadro = 0;
  let x = 0;
  let y = 0;

  function atualizar() {
    quadro = 0;
    if (!visivel || document.hidden || !movimento.matches) {
      palco.removeAttribute('data-movimento');
      return;
    }
    if (!marca.complete || !marca.naturalWidth) return;
    const area = abertura.getBoundingClientRect();
    const rolagem = Math.min(1, Math.max(0, -area.top / area.height));
    palco.style.setProperty('--mascara-logo', 'url("' + (marca.currentSrc || marca.src) + '")');
    palco.style.setProperty('--logo-x', -x * 10 + 'px');
    palco.style.setProperty('--logo-y', -y * 8 + 'px');
    palco.style.setProperty('--logo-escala', 1 + rolagem * .036);
    palco.style.setProperty('--foto-x', -x * 3 + 'px');
    palco.style.setProperty('--foto-y', -y * 2 + 'px');
    palco.style.setProperty('--faixa-y', rolagem * 16 + 'px');
    palco.dataset.movimento = '';
  }
  function agendar() {
    if (!quadro) quadro = requestAnimationFrame(atualizar);
  }
  abertura.addEventListener('pointermove', event => {
    if (!visivel || !movimento.matches || !mouse.matches || event.pointerType !== 'mouse') return;
    const area = abertura.getBoundingClientRect();
    x = 2 * (event.clientX - area.left) / area.width - 1;
    y = 2 * (event.clientY - area.top) / area.height - 1;
    agendar();
  }, {passive: true});
  abertura.addEventListener('pointerleave', () => { x = y = 0; agendar(); });
  new IntersectionObserver(([entrada]) => {
    visivel = entrada.isIntersecting;
    agendar();
  }).observe(palco);
  window.addEventListener('scroll', () => { if (visivel && movimento.matches) agendar(); }, {passive: true});
  window.addEventListener('resize', agendar, {passive: true});
  marca.addEventListener('load', agendar);
  document.addEventListener('visibilitychange', agendar);
  movimento.addEventListener('change', agendar);
})();
