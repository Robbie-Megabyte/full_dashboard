"use strict";
/*
 * Car Control → Mapping, as the robot Mapping card:
 *  - Save only with a map name;
 *  - keyboard teleop of the car (Enter / Stop teleop), usable at any time;
 *  - Session / Captures every 5 s / Latest capture of the car mapping;
 *  - car partial-map sessions: View latest capture / Download latest.
 * The car state arrives through the runtime events (runtime-car-message) and
 * the car.js poll of /api/car/status (both dispatch through carExtrasUpdate).
 */
(() => {
  // Car speeds for the keyboard (the car bridge caps them at 0.6 m/s, 1.5 rad/s).
  // The car's motor driver ignores |linear| below 0.36 m/s, and it steers like
  // a car: left/right alone only turn the wheels, W+A / W+D drive a curve.
  const LINEAR = 0.45;
  const ANGULAR = 0.8;
  const REPEAT_MS = 100;

  let carConnected = false;
  let carMode = "none";
  let carModeStatus = "stopped";
  let teleopEnabled = false;
  let teleopBusy = false;
  const held = new Map(); // event.code -> [linear, angular]
  let lastSent = null;
  let sending = false;

  const KEYS = {
    ArrowUp: [1, 0], KeyW: [1, 0],
    ArrowDown: [-1, 0], KeyS: [-1, 0],
    ArrowLeft: [0, 1], KeyA: [0, 1],
    ArrowRight: [0, -1], KeyD: [0, -1],
  };

  /* ---------------- Save needs a name ---------------- */
  function syncSave() {
    const save = $("car-save-map");
    if (save && !save.classList.contains("fd18-busy")) {
      save.disabled = !$("car-map-name").value.trim();
    }
  }
  $("car-map-name")?.addEventListener("input", syncSave);
  $("car-save-map")?.addEventListener("click", (event) => {
    // car.js sends the save; an empty name is never sent.
    if (!$("car-map-name").value.trim()) {
      event.stopImmediatePropagation();
      toast("Enter a map name", true);
    }
  }, true);
  syncSave();

  /* ---------------- Keyboard teleop ---------------- */
  function syncTeleopButtons() {
    const robotArmed = typeof window.slamTeleopArmed === "function" && window.slamTeleopArmed();
    const enter = $("car-enable-teleop");
    const stop = $("car-disable-teleop");
    if (enter) enter.disabled = teleopBusy || teleopEnabled || !carConnected || robotArmed;
    if (stop) stop.disabled = teleopBusy || !teleopEnabled;
    enter?.setAttribute("title", robotArmed ? "Stop the robot teleop first" : "");
    window.dispatchEvent(new CustomEvent("car-teleop-state", { detail: { enabled: teleopEnabled } }));
  }
  window.carTeleopArmed = () => teleopEnabled;

  function currentVelocity() {
    let linear = 0;
    let angular = 0;
    for (const [dl, da] of held.values()) {
      linear += dl;
      angular += da;
    }
    // Keyboard left/right represent wheel steering. The car's cmd_vel
    // angular value represents yaw, whose sign reverses when backing up.
    const direction = linear < 0 ? -1 : 1;
    return [Math.sign(linear) * LINEAR, Math.sign(angular) * ANGULAR * direction];
  }

  async function sendVelocity(force = false) {
    if (!teleopEnabled || sending) return;
    const [linear, angular] = currentVelocity();
    const moving = linear !== 0 || angular !== 0;
    // While a key is held the command is repeated; the stop is sent once.
    if (!moving && !force && lastSent && lastSent[0] === 0 && lastSent[1] === 0) return;
    sending = true;
    try {
      await api("/api/car/teleop/cmd", {
        method: "POST",
        body: JSON.stringify({ linear, angular }),
      });
      lastSent = [linear, angular];
    } catch (error) {
      held.clear();
      toast(`Car teleop: ${error.message}`, true);
    } finally {
      sending = false;
    }
  }

  function editable(target) {
    return target instanceof HTMLElement && (
      target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
    );
  }

  window.addEventListener("keydown", (event) => {
    if (!teleopEnabled || editable(event.target)) return;
    if (event.code === "Space") {
      event.preventDefault();
      held.clear();
      sendVelocity(true);
      return;
    }
    const step = KEYS[event.code];
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat && held.has(event.code)) return;
    held.set(event.code, step);
    sendVelocity();
  }, { capture: true });

  window.addEventListener("keyup", (event) => {
    if (!held.delete(event.code)) return;
    event.preventDefault();
    sendVelocity(true);
  }, { capture: true });

  window.addEventListener("blur", () => {
    if (!held.size) return;
    held.clear();
    sendVelocity(true);
  });

  // The car stops after 0.5 s without commands, so a held key is repeated.
  setInterval(() => {
    if (teleopEnabled && held.size) sendVelocity();
  }, REPEAT_MS);

  $("car-enable-teleop")?.addEventListener("click", async (event) => {
    if (!window.confirm("CONFIRM CAR TELEOP\nThe car is in a free area. The arrow keys / W A S D on this page will drive the car (Space stops). Continue?")) return;
    teleopBusy = true;
    syncTeleopButtons();
    const result = await action(event.currentTarget, "Arming…", () => api("/api/car/teleop/enable", { method: "POST" }));
    teleopBusy = false;
    if (result) {
      teleopEnabled = true;
      lastSent = null;
      document.activeElement?.blur();
    }
    syncTeleopButtons();
  });

  $("car-disable-teleop")?.addEventListener("click", async (event) => {
    held.clear();
    teleopBusy = true;
    syncTeleopButtons();
    const result = await action(event.currentTarget, "Stopping…", () => api("/api/car/teleop/disable", { method: "POST" }));
    teleopBusy = false;
    if (result) teleopEnabled = false;
    syncTeleopButtons();
  });

  // One keyboard owner: the robot teleop cannot be armed while the car is.
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#enable-teleop") && teleopEnabled) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toast("Stop the car teleop first", true);
    }
  }, true);

  /* ---------------- Wheel offset ---------------- */
  // The steering servo offset of the car (its bridge parameter servo_offset).
  // Every time the dashboard opens it sets the default 90 once the car is
  // connected; the slider then changes it.
  const OFFSET_DEFAULT = 90;
  const offsetInput = $("car-servo-offset");
  let offsetSentOnOpen = false;
  let offsetTimer = null;

  function paintOffset() {
    if (!offsetInput) return;
    const min = Number(offsetInput.min), max = Number(offsetInput.max);
    const pct = `${((Number(offsetInput.value) - min) / (max - min)) * 100}%`;
    for (const name of ["--fd151-fill", "--fd13-fill", "--fd14-fill", "--fd15-fill", "--fd16-range-pct"]) {
      offsetInput.style.setProperty(name, pct);
    }
    const label = $("car-servo-offset-value");
    if (label) label.textContent = offsetInput.value;
  }

  async function sendOffset() {
    try {
      await api("/api/car/servo_offset", {
        method: "POST",
        body: JSON.stringify({ value: Number(offsetInput.value) }),
      });
    } catch (error) {
      toast(`Wheel offset: ${error.message}`, true);
    }
  }

  offsetInput?.addEventListener("input", () => {
    paintOffset();
    window.clearTimeout(offsetTimer);
    offsetTimer = window.setTimeout(sendOffset, 150);
  });
  if (offsetInput) {
    offsetInput.value = String(OFFSET_DEFAULT);
    paintOffset();
  }

  function applyOffsetOnOpen() {
    if (offsetSentOnOpen || !carConnected || !offsetInput) return;
    offsetSentOnOpen = true;
    offsetInput.value = String(OFFSET_DEFAULT);
    paintOffset();
    sendOffset();
  }

  /* ---------------- Enter/Stop Mapping and Localization ---------------- */
  // Only one car mode at a time: Enter is available when no mode runs, Stop
  // only for the mode that runs.
  window.carModeActive = (mode) => carMode === mode;
  function syncModeButtons() {
    const switching = carModeStatus === "switching";
    const idle = carMode === "none" || carMode === "" || !carMode;
    const set = (id, disabled) => {
      const button = $(id);
      if (button && !button.classList.contains("fd18-busy") && button.disabled !== disabled) {
        button.disabled = disabled;
      }
    };
    set("car-mapping", !carConnected || !idle || switching);
    set("car-localization", !carConnected || !idle || switching);
    set("car-mapping-stop", carMode !== "mapping");
    set("car-localization-stop", carMode !== "localization");
    window.dispatchEvent(new CustomEvent("car-mode-state", { detail: { mode: carMode, status: carModeStatus } }));
  }

  /* ---------------- Car mapping captures ---------------- */
  function update(msg) {
    if (!msg || typeof msg !== "object") return;
    if ("connected" in msg) carConnected = Boolean(msg.connected);
    if ("current_mode" in msg) carMode = msg.current_mode || "none";
    if ("mode_status" in msg) carModeStatus = msg.mode_status || "stopped";
    if ("teleop_enabled" in msg && !teleopBusy) {
      teleopEnabled = Boolean(msg.teleop_enabled);
      if (!teleopEnabled) held.clear();
    }
    if ("mapping_session" in msg) {
      const session = msg.mapping_session || "—";
      const sessionNode = $("car-session-name");
      if (sessionNode) sessionNode.textContent = session;
      if ($("car-snapshots")) $("car-snapshots").textContent = String(msg.snapshots || 0);
      if ($("car-last-snapshot")) $("car-last-snapshot").textContent = msg.last_snapshot || "—";
      if (msg.last_snapshot && msg.last_snapshot !== update.lastCapture) {
        update.lastCapture = msg.last_snapshot;
        if (msg.snapshots === 1) refreshSessions();
      }
    }
    syncTeleopButtons();
    syncModeButtons();
    applyOffsetOnOpen();
  }
  window.carExtrasUpdate = update;

  window.addEventListener("runtime-car-message", (event) => {
    const msg = event.detail || {};
    if (msg.type === "car_state") update(msg);
    else if (msg.type === "car_mode_status") update({ current_mode: msg.current_mode, mode_status: msg.mode_status });
  });

  async function pollState() {
    if (!window.slamViewVisible()) return;
    try {
      update(await api("/api/car/status?include_layers=false"));
    } catch (_) {
      // car.js reports the connection problem.
    }
  }
  pollState();
  setInterval(pollState, 1000);
  // The robot teleop state changes on the app.js refresh; car.js re-enables
  // buttons after their commands, so the mode buttons are re-derived too.
  setInterval(() => {
    syncTeleopButtons();
    syncModeButtons();
  }, 500);

  async function refreshSessions() {
    try {
      const data = await api("/api/car/partial-maps");
      const select = $("car-partial-sessions");
      const previous = select.value;
      const sessions = data.partial_sessions || [];
      select.innerHTML = `<option value="">${sessions.length ? "Newest session" : "No saved sessions"}</option>`;
      for (const item of sessions) {
        const option = document.createElement("option");
        option.value = item.name;
        option.textContent = `${item.name} · ${item.snapshots} captures`;
        select.appendChild(option);
      }
      if ([...select.options].some((option) => option.value === previous)) select.value = previous;
      select.dispatchEvent(new Event("change"));
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function latestCapture() {
    const select = $("car-partial-sessions");
    const session = select.value || [...select.options].map((option) => option.value).find(Boolean);
    if (!session) throw new Error("No car partial mapping session is available");
    const listing = await api(`/api/car/partial-maps/${encodeURIComponent(session)}`);
    const captures = listing.snapshots || [];
    if (!captures.length) throw new Error("This session has no capture yet");
    return { session, capture: captures[captures.length - 1].name };
  }

  $("car-refresh-partials")?.addEventListener("click", refreshSessions);
  $("car-view-partial")?.addEventListener("click", async (event) => {
    await action(event.currentTarget, "Loading…", async () => {
      const latest = await latestCapture();
      await api(
        `/api/car/partial-maps/${encodeURIComponent(latest.session)}/${encodeURIComponent(latest.capture)}/view`,
        { method: "POST" },
      );
      return { success: true, message: `Car capture ${latest.capture} is displayed` };
    });
  });
  $("car-download-partial")?.addEventListener("click", async () => {
    try {
      const latest = await latestCapture();
      window.location.href = runtimePath(
        `/api/car/partial-maps/${encodeURIComponent(latest.session)}/${encodeURIComponent(latest.capture)}/file`,
      );
    } catch (error) {
      toast(error.message, true);
    }
  });

  refreshSessions();
  syncTeleopButtons();
})();
