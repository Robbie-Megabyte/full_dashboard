"use strict";
/*
 * Robot RGB and Depth cards of the SLAM tab.
 *
 * The RealSense camera is owned by the Full Dashboard (teleimager). These cards
 * are extra WebRTC viewers of the same streams, negotiated through the bridge's
 * passive camera endpoints exactly like the Live tab; teleimager relays one
 * encoded stream to every viewer, so Live keeps its own connections.
 *
 * While the SLAM tab is visible the camera is started and the rgb/depth views
 * are enabled if needed. When the tab is hidden the peers are closed and only
 * what this tab changed is restored: views it added are removed and the camera
 * is stopped if this tab started it.
 */
(() => {
  // Camera ownership belongs to the Full Dashboard; opened on its own, this page
  // must not start the camera or change the Live view selection.
  if (!window.frameElement) return;
  const VIEWS = { rgb: "camera-color", depth: "camera-depth" };
  const RUNNING = new Set(["RUNNING", "RUNNING_EXTERNAL"]);
  const peers = new Map();
  let active = false;
  let queue = Promise.resolve();
  let startedCamera = false;
  let addedViews = [];

  async function bridge(path, payload) {
    const response = await fetch(path, payload === undefined ? { cache: "no-store" } : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  const cameraStatus = () => bridge("/api/camera");

  function viewReady(status, view) {
    return Boolean((status.camera_views || []).find((item) => item.id === view)?.port_ready);
  }

  async function waitIceComplete(pc, timeoutMs = 3500) {
    if (pc.iceGatheringState === "complete") return;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  function closePeer(view) {
    const pc = peers.get(view);
    peers.delete(view);
    if (pc) pc.close();
    const video = document.getElementById(VIEWS[view]);
    if (video) {
      video.srcObject = null;
      video.classList.remove("is-live");
    }
  }

  async function connectView(view) {
    closePeer(view);
    const video = document.getElementById(VIEWS[view]);
    if (!video) return;
    const pc = new RTCPeerConnection({ sdpSemantics: "unified-plan" });
    peers.set(view, pc);
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addEventListener("track", (event) => {
      if (peers.get(view) !== pc || event.track.kind !== "video") return;
      video.srcObject = event.streams[0];
      video.classList.add("is-live");
      video.play().catch(() => {});
    });
    pc.addEventListener("connectionstatechange", () => {
      if (peers.get(view) !== pc) return;
      if (["failed", "disconnected"].includes(pc.connectionState)) {
        video.classList.remove("is-live");
        setTimeout(() => { if (active && peers.get(view) === pc) connectView(view); }, 2000);
      }
    });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIceComplete(pc);
    const answer = await bridge(`/api/camera/passive/offer?view=${encodeURIComponent(view)}`, {
      sdp: pc.localDescription.sdp,
      type: pc.localDescription.type,
      codec: null,
    });
    if (peers.get(view) !== pc) return;
    await pc.setRemoteDescription(answer);
  }

  async function activate() {
    let status = await cameraStatus();
    const requested = Array.isArray(status.web_views_requested) ? status.web_views_requested : [];
    const missing = Object.keys(VIEWS).filter((view) => !requested.includes(view));
    const running = RUNNING.has(String(status.state || "").toUpperCase());
    if (!running || missing.length) {
      await bridge("/api/camera/passive/prepare", { views: [...requested, ...missing] });
      startedCamera = startedCamera || !running;
      addedViews = [...new Set([...addedViews, ...missing])];
    }
    const deadline = Date.now() + 15000;
    for (const view of Object.keys(VIEWS)) {
      while (active && !viewReady(status, view) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        status = await cameraStatus();
      }
      if (active && viewReady(status, view)) await connectView(view);
    }
  }

  async function deactivate() {
    for (const view of Object.keys(VIEWS)) closePeer(view);
    if (addedViews.length) {
      const status = await cameraStatus();
      const current = Array.isArray(status.web_views_requested) ? status.web_views_requested : [];
      const restored = current.filter((view) => !addedViews.includes(view));
      if (restored.length) await bridge("/api/camera/views", { views: restored });
      addedViews = [];
    }
    if (startedCamera) {
      await bridge("/api/camera/stop", {});
      startedCamera = false;
    }
  }

  function sync() {
    const visible = window.slamViewVisible();
    if (visible === active) return;
    active = visible;
    queue = queue
      .then(() => (visible ? activate() : deactivate()))
      .catch((error) => log(`Camera: ${error.message}`));
  }

  window.addEventListener("pagehide", () => {
    for (const view of Object.keys(VIEWS)) closePeer(view);
  });
  sync();
  setInterval(sync, 1000);
})();
