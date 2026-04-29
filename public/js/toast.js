/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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
