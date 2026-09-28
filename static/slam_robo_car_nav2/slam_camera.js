"use strict";
/*
 * Robot RGB and Depth cards of the SLAM tab.
 *
 * They show the SLAM runtime's own camera frames (/api/camera/color|depth),
 * not the Live tab streams: the Full Dashboard camera server sends the runtime
 * raw frames while it asks for them, so the color frame carries only the SLAM
 * tab's YOLO detections (the SLAM YOLO toggle) and never the Live tab's.
 *
 * While the tab is visible each card reloads its frame about 8 times a second;
 * when the tab is hidden polling pauses and the last frame stays, so the cards
 * show an image at once on return.
 */
(() => {
  const VIEWS = { color: "camera-color", depth: "camera-depth" };
  const FRAME_MS = 125;
  const RETRY_MS = 1000;

  function poll(kind, image) {
    let timer = null;
    const schedule = (delay) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, delay);
    };
    // The browser keeps showing the previous frame until the next one loads.
    image.addEventListener("load", () => {
      image.classList.add("is-live");
      schedule(FRAME_MS);
    });
    image.addEventListener("error", () => {
      // No frame yet (camera server stopped or still starting).
      image.classList.remove("is-live");
      schedule(RETRY_MS);
    });

    function load() {
      if (!window.slamViewVisible()) {
        schedule(500);
        return;
      }
      image.src = runtimePath(`/api/camera/${kind}?t=${Date.now()}`);
    }

    load();
  }

  // Opened on its own (not inside the Full Dashboard), the page has no frames.
  if (!window.frameElement) return;
  for (const [kind, id] of Object.entries(VIEWS)) {
    const image = document.getElementById(id);
    if (image) poll(kind, image);
  }
})();
