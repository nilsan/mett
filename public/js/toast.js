(function () {
  const el = document.createElement('div');
  el.id = 'mett-toast';
  el.setAttribute('aria-live', 'assertive');
  document.body.appendChild(el);

  let timer;
  window.showToast = function (msg) {
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('visible'), 4000);
  };
})();
