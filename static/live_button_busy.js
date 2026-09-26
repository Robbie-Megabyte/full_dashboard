/*
 * Live tab loading indicator for every button.
 *
 * A button clicked in the Live tab is shown as loading (fd-req-busy, styled
 * in styles.css with the button's own color) while the non-GET requests it
 * started are in flight. Requests are linked to the click that happened just
 * before them, so polling and background traffic never mark a button busy.
 */
(() => {
  "use strict";

  const LINK_WINDOW_MS = 400;
  const MIN_VISIBLE_MS = 250;
  let lastClick = null;

  document.addEventListener("click", event => {
    const button = event.target.closest?.("#view-live button, #view-live [role='button']");
    if (!button || button.disabled) return;
    lastClick = {button, at: performance.now()};
  }, true);

  const baseFetch = window.fetch.bind(window);

  window.fetch = function fetchWithButtonBusy(resource, options = {}) {
    const method = String(options?.method || resource?.method || "GET").toUpperCase();
    const click = lastClick;
    const linked = method !== "GET" && method !== "HEAD" && click
      && performance.now() - click.at < LINK_WINDOW_MS;
    const request = baseFetch(resource, options);
    if (!linked) return request;

    const button = click.button;
    const count = Number(button.dataset.fdReqBusy || 0) + 1;
    button.dataset.fdReqBusy = String(count);
    button.classList.add("fd-req-busy");
    const started = performance.now();
    const done = () => {
      const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - started));
      window.setTimeout(() => {
        const left = Number(button.dataset.fdReqBusy || 1) - 1;
        button.dataset.fdReqBusy = String(left);
        if (left <= 0) button.classList.remove("fd-req-busy");
      }, wait);
    };
    request.then(done, done);
    return request;
  };
})();
