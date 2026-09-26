(() => {
  "use strict";

  // Status and actions go through the robot bridge, which forwards them to
  // the companion on the PC this browser runs on ("available" means this PC
  // has the pipeline). Frames are loaded straight from that PC (its address
  // comes from the health answer), so they never cross the robot's Wi-Fi.
  const COMPANION = "/api/camera-teleop";
  const ACTION_PATHS = {
    configure: "/configure",
    enter: "/enter",
    stop: "/stop",
  };
  const FRAME_PATHS = {
    raw: "/api/camera/raw.jpg",
    keypoints: "/api/camera/keypoints.jpg",
    simulation: "/api/mujoco/frame.jpg",
  };
  // 10 fps, as the pipeline dashboard refreshed its previews.
  const FRAME_INTERVAL_MS = 100;
  const companionIds = ["raw", "simulation", "keypoints"];
  const runtime = {
    capability: null,
    companionVerified: false,
    pending: "",
    pollBusy: false,
    frameTimer: null,
    framesOrigin: "",
  };

  // Physical stack states as the pipeline dashboard labels them.
  const SYSTEM_LABELS = {
    off: "OFF",
    ready_to_start: "READY TO START",
    live: "LIVE",
    stopping: "STOPPING",
    error: "ERROR",
    validation_failed: "VALIDATION FAILED",
    physical_init_failed: "PHYSICAL INIT FAILED",
  };

  const byId = id => document.getElementById(id);
  const upper = value => String(value || "off").replaceAll("_", " ").toUpperCase();
  const cameraMode = () => byId("teleoperationSelectV16")?.value === "camera";

  function payload() {
    return runtime.capability?.status || {};
  }

  function physical() {
    return runtime.capability?.physical || {
      state: "unavailable",
      active: false,
      ready_to_start: false,
      live: false,
    };
  }

  function processState(value, prefix = "") {
    if (!value?.process_alive) return "OFF";
    const state = upper(value.state || "starting");
    return prefix ? `${prefix} · ${state}` : state;
  }

  function statusRows() {
    const capability = runtime.capability;
    if (!capability?.available) {
      return [
        ["System", capability ? "UNAVAILABLE" : "CHECKING"],
        ["Simulation", "OFF"],
        ["SONIC", "OFF"],
        ["Camera", "OFF"],
        ["Alignment", "WAITING"],
        ["Tracking", "OFF"],
      ];
    }

    const data = payload();
    const stack = physical();
    const physicalSonic = stack.physical_sonic || {};
    const validationSonic = stack.validation_sonic || {};
    const fallbackSonic = data.sonic || {};
    const camera = data.camera;
    const cameraState = typeof camera === "object"
      ? camera?.state
      : camera;
    const alignment = typeof data.alignment === "object"
      ? data.alignment?.state
      : data.alignment;

    let sonic = "OFF";
    if (physicalSonic.process_alive) {
      sonic = processState(physicalSonic, "ROBOT");
    } else if (validationSonic.process_alive) {
      sonic = processState(validationSonic, "SIM");
    } else if (fallbackSonic.process_alive) {
      sonic = processState(fallbackSonic, "SIM");
    }

    let tracking = "OFF";
    if (stack.live || stack.physical_live) {
      tracking = "LIVE";
    } else if (stack.v2_ready) {
      tracking = "READY";
    }

    return [
      ["System", SYSTEM_LABELS[stack.state] || upper(stack.state)],
      ["Simulation", data.mujoco_preview?.live ? "LIVE" : "OFF"],
      ["SONIC", sonic],
      ["Camera", upper(cameraState)],
      ["Alignment", stack.active ? upper(alignment) : "OFF"],
      ["Tracking", tracking],
    ];
  }

  window.fullDashCameraTeleopRuntime = {
    statusRows,
    capability: () => runtime.capability,
  };

  function toneFor(value) {
    const text = upper(value);
    if (/ERROR|FAULT|FAILED|UNAVAILABLE/.test(text)) return "bad";
    if (/WAITING|STARTING|STOPPING|PENDING|ALIGN/.test(text)) return "warn";
    if (/READY|RUNNING|LIVE|OK|ON|CONNECTED|TRACKING/.test(text)) return "good";
    return "neutral";
  }

  function renderStatus() {
    if (!cameraMode()) return;
    statusRows().forEach(([label, value], index) => {
      const number = index + 1;
      const labelNode = byId(`teleopStatusLabel${number}V21`);
      const valueNode = byId(`teleopStatusValue${number}V21`);
      if (labelNode) labelNode.textContent = label;
      if (valueNode) {
        valueNode.textContent = value;
        valueNode.dataset.tone = toneFor(value);
      }
    });
  }

  function tile(id) {
    return document.querySelector(`[data-camera-view-tile="${id}"]`);
  }

  function setTileState(id, state, detail, tone = "") {
    const root = tile(id);
    if (!root) return;
    const stateNode = root.querySelector(`[data-camera-state="${id}"]`);
    const overlay = root.querySelector(`[data-camera-overlay="${id}"]`);
    const title = root.querySelector(`[data-camera-overlay-title="${id}"]`);
    const text = root.querySelector(`[data-camera-overlay-text="${id}"]`);
    if (stateNode) {
      stateNode.textContent = state;
      stateNode.className = `camera-tile-state${tone ? ` ${tone}` : ""}`;
    }
    if (title) title.textContent = state;
    if (text) text.textContent = detail;
    overlay?.classList.toggle("hidden", state === "LIVE");
    // Hides the idle animation and its label while frames are shown.
    root.dataset.companionLive = state === "LIVE" ? "true" : "false";
  }

  function mediaVisible(id) {
    const root = tile(id);
    return Boolean(root && root.isConnected && !root.classList.contains("hidden"));
  }

  function clearMedia(id) {
    const image = document.querySelector(`[data-camera-companion="${id}"]`);
    if (!image) return;
    image.removeAttribute("src");
    image.dataset.loading = "false";
  }

  function bindImageEvents(id, image) {
    if (image.dataset.teleopEvents === "bound") return;
    image.dataset.teleopEvents = "bound";
    image.addEventListener("load", () => {
      image.dataset.loading = "false";
      setTileState(id, "LIVE", "", "good");
    });
    image.addEventListener("error", () => {
      image.dataset.loading = "false";
      setTileState(id, "WAITING", "Waiting for the companion-PC preview.", "warn");
    });
  }

  function refreshSnapshot(id) {
    const image = document.querySelector(`[data-camera-companion="${id}"]`);
    if (!image || !runtime.framesOrigin || !mediaVisible(id)
        || image.dataset.loading === "true") return;
    bindImageEvents(id, image);
    image.dataset.loading = "true";
    image.src = `${runtime.framesOrigin}${FRAME_PATHS[id]}?t=${Date.now()}`;
  }

  function syncMedia() {
    bindSimulationControls();
    const available = Boolean(runtime.capability?.available);
    const stack = physical();
    const active = available && Boolean(stack.active);

    for (const id of companionIds) {
      if (!available) {
        clearMedia(id);
        setTileState(id, "UNAVAILABLE", "Camera teleoperation is not available on this computer.", "bad");
      } else if (!active) {
        clearMedia(id);
        setTileState(id, "OFF", "Press Configure to start the companion-PC pipeline.");
      }
    }

    if (active && !simulationLive()) {
      clearMedia("simulation");
      setTileState("simulation", "WAITING", "Waiting for the MuJoCo preview.", "warn");
    }
  }

  // MuJoCo preview camera, as in the pipeline dashboard: drag to orbit,
  // wheel to zoom, double-click to reset, and the view presets. Sent straight
  // to this PC's companion; it only moves the preview camera.
  function sendSimulationCamera(command) {
    if (!runtime.framesOrigin) return;
    fetch(`${runtime.framesOrigin}/api/mujoco/camera`, {
      method: "POST",
      mode: "no-cors",
      headers: {"Content-Type": "text/plain"},
      body: JSON.stringify(command),
    }).catch(() => {});
  }

  function bindSimulationControls() {
    const root = tile("simulation");
    const body = root?.querySelector(".camera-tile-body");
    if (!body || body.dataset.simControls === "bound") return;
    body.dataset.simControls = "bound";

    const toolbar = document.createElement("div");
    toolbar.className = "camera-sim-toolbar";
    toolbar.innerHTML = ["front", "side", "rear", "reset"].map(name =>
      `<button type="button" data-sim-camera="${name}">${name[0].toUpperCase()}${name.slice(1)}</button>`
    ).join("");
    body.appendChild(toolbar);
    toolbar.addEventListener("click", event => {
      const button = event.target.closest("[data-sim-camera]");
      if (button) sendSimulationCamera({op: "preset", name: button.dataset.simCamera});
    });

    let drag = null;
    let pending = {dx: 0, dy: 0};
    let timer = null;
    const flush = () => {
      timer = null;
      const {dx, dy} = pending;
      pending = {dx: 0, dy: 0};
      if (dx || dy) sendSimulationCamera({op: "orbit", dx, dy});
    };
    body.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.target.closest(".camera-sim-toolbar")) return;
      if (root.dataset.companionLive !== "true") return;
      drag = {x: event.clientX, y: event.clientY};
      body.classList.add("camera-sim-dragging");
      try { body.setPointerCapture(event.pointerId); } catch (_) {}
      event.preventDefault();
    });
    body.addEventListener("pointermove", event => {
      if (!drag) return;
      pending.dx += event.clientX - drag.x;
      pending.dy += event.clientY - drag.y;
      drag = {x: event.clientX, y: event.clientY};
      // About 28 Hz, like the pipeline dashboard.
      if (!timer) timer = window.setTimeout(flush, 35);
    });
    const end = () => {
      drag = null;
      body.classList.remove("camera-sim-dragging");
    };
    body.addEventListener("pointerup", end);
    body.addEventListener("pointercancel", end);
    body.addEventListener("wheel", event => {
      if (root.dataset.companionLive !== "true") return;
      event.preventDefault();
      const delta = Math.sign(event.deltaY);
      if (delta) sendSimulationCamera({op: "zoom", delta});
    }, {passive: false});
    body.addEventListener("dblclick", event => {
      if (root.dataset.companionLive !== "true" || event.target.closest(".camera-sim-toolbar")) return;
      sendSimulationCamera({op: "reset"});
    });
  }

  function simulationLive() {
    return Boolean(payload().mujoco_preview?.live);
  }

  function renderControls() {
    const capability = runtime.capability;
    const available = Boolean(capability?.available);
    const stack = physical();
    const state = String(stack.state || "off");
    const active = available && Boolean(stack.active);
    const ready = available && Boolean(stack.ready_to_start);
    const live = available && Boolean(stack.live);
    const host = byId("cameraControllerControlsV21");
    const configure = byId("cameraConfigureV21");
    const enter = byId("cameraEnterV21");
    const stop = byId("cameraStopV21");
    const mainbarUnavailable = byId("cameraTeleopMainbarUnavailableV1");
    const pending = runtime.pending;

    // One UI step: which segment is current, and which one is loading.
    let step = "idle";
    if (!available) step = "unavailable";
    else if (pending === "stop" || state === "stopping") step = "stopping";
    else if (live) step = "teleop";
    else if (pending === "enter") step = "entering";
    else if (ready) step = "configured";
    else if (pending === "configure" || active) step = "configuring";

    if (host) {
      host.dataset.cameraState = step;
      host.dataset.backendState = state;
      host.title = available
        ? `Camera teleoperation: ${upper(state)}`
        : (capability?.error || "Camera teleoperation is unavailable on this PC.");
    }
    // Stop is usable from the moment Configure is pressed until stopped.
    const stoppable = ["configuring", "configured", "entering", "teleop"].includes(step);
    if (configure) configure.disabled = step !== "idle";
    if (enter) enter.disabled = step !== "configured";
    if (stop) stop.disabled = !stoppable;
    setBusy(configure, step === "configuring");
    setBusy(enter, step === "entering");
    setBusy(stop, step === "stopping");
    if (mainbarUnavailable) {
      // Unknown until the first probe finishes; no flash before that.
      const showUnavailable = cameraMode() && capability !== null && !available;
      mainbarUnavailable.hidden = !showUnavailable;
      mainbarUnavailable.setAttribute(
        "aria-hidden", showUnavailable ? "false" : "true"
      );
    }


    document.querySelectorAll('[data-camera-mode="raw"], [data-camera-mode="simulation"], [data-camera-mode="keypoints"]')
      .forEach(button => {
        button.disabled = !available;
        button.setAttribute("aria-disabled", available ? "false" : "true");
        if (!available) {
          button.title = "Camera teleoperation requires the companion-PC pipeline.";
        }
      });

    renderStatus();
    syncMedia();
  }

  function setBusy(button, busy) {
    if (!button) return;
    button.classList.toggle("fd-state-busy", busy);
    button.setAttribute("aria-busy", busy ? "true" : "false");
  }

  async function companionFetch(path, options = {}) {
    const controller = new AbortController();
    // Actions (Stop waits for the pipeline threads) get longer than polls.
    const limit = options.method === "POST" ? 60000 : 2500;
    const timeout = window.setTimeout(() => controller.abort(), limit);
    try {
      return await fetch(`${COMPANION}${path}`, {
        credentials: "same-origin",
        cache: "no-store",
        ...options,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function refreshStatus() {
    if (runtime.pollBusy) return;
    runtime.pollBusy = true;
    try {
      if (!runtime.companionVerified) {
        const healthResponse = await companionFetch("/health");
        if (!healthResponse.ok) throw new Error(`health HTTP ${healthResponse.status}`);
        const health = await healthResponse.json();
        if (
          health?.service !== "camera_pose_teleop_companion"
          || health?.pipeline_installed !== true
        ) {
          throw new Error("unexpected localhost service");
        }
        runtime.companionVerified = true;
        runtime.framesOrigin = String(health.frames_origin || "");
      }

      const response = await companionFetch("/status");
      if (!response.ok) throw new Error(`status HTTP ${response.status}`);
      const status = await response.json();
      const stack = status?.physical || {};
      runtime.capability = {
        schema: "g1_dashboard.camera_teleop.local.v1",
        available: true,
        pipeline_installed: true,
        error: null,
        status,
        physical: stack,
      };
    } catch (error) {
      runtime.companionVerified = false;
      runtime.framesOrigin = "";
      runtime.capability = {
        available: false,
        pipeline_installed: false,
        error: "No camera teleoperation pipeline companion was detected on this PC.",
        detail: String(error?.message || error),
        status: null,
        physical: {state: "unavailable", active: false, ready_to_start: false, live: false},
      };
    } finally {
      runtime.pollBusy = false;
      renderControls();
    }
  }

  async function requestAction(action) {
    // Stop always goes through, even while Configure is still running.
    if (runtime.pending && (action !== "stop" || runtime.pending === "stop")) return;
    runtime.pending = action;
    renderControls();
    try {
      const path = ACTION_PATHS[action];
      if (!path) throw new Error(`Unsupported action: ${action}`);
      const post = () => companionFetch(path, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: "{}",
      });
      let response = await post();
      if (response.status === 401) {
        // Actions need the dashboard's trusted session; obtain it once.
        await fetch("/api/session/bootstrap", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
        });
        response = await post();
      }
      let result = {};
      try { result = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    } catch (error) {
      window.alert(`Camera teleoperation ${action} failed: ${error.message || error}`);
    } finally {
      if (runtime.pending === action) runtime.pending = "";
      await refreshStatus();
    }
  }

  function interceptCameraActions() {
    document.addEventListener("click", event => {
      const button = event.target.closest?.(
        "#cameraConfigureV21, #cameraEnterV21, #cameraStopV21"
      );
      if (!button || !cameraMode()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (button.disabled) return;
      const action = button.id === "cameraConfigureV21"
        ? "configure"
        : button.id === "cameraEnterV21"
          ? "enter"
          : "stop";
      requestAction(action);
    }, true);
  }

  // The viewing PC is probed only while Camera teleoperation is selected (or
  // its stack is still active), so VR-only use never touches localhost.
  function poll() {
    if (cameraMode() || physical().active) refreshStatus();
  }

  function boot() {
    interceptCameraActions();
    byId("teleoperationSelectV16")?.addEventListener("change", () => {
      renderControls();
      poll();
    });
    runtime.frameTimer = window.setInterval(() => {
      const active = runtime.capability?.available && physical().active;
      if (!active) return;
      refreshSnapshot("raw");
      refreshSnapshot("keypoints");
      if (simulationLive()) refreshSnapshot("simulation");
    }, FRAME_INTERVAL_MS);
    poll();
    window.setInterval(poll, 750);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, {once: true});
  } else {
    boot();
  }
})();
