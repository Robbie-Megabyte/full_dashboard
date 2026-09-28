/*
 * Live tab Robot Modes: Damp, Ready, Dev, Zero Torque, Walk, Run.
 *
 * The buttons unlock only with the robot mode password, as in the SLAM tab,
 * and the SLAM runtime checks it again (/slam-runtime/api/robot/mode). The
 * current mode is read from the same runtime.
 */
(() => {
  "use strict";

  const PASSWORD = "123";
  const LABELS = {
    damp: "DAMP",
    ready: "READY",
    zero_torque: "ZERO TORQUE",
    walk: "WALK",
    run: "RUN",
    locomotion: "LOCOMOTION",
    dev: "DEV",
  };

  const byId = id => document.getElementById(id);
  const password = byId("liveRobotModePassword");
  const current = byId("liveRobotModeCurrent");
  const refresh = byId("liveRobotModeRefresh");
  const buttons = [...document.querySelectorAll("[data-live-robot-mode]")];
  let busy = false;

  function syncButtons() {
    const unlocked = password?.value === PASSWORD;
    // The button whose request runs keeps its look, with the loading ring.
    for (const button of buttons) {
      button.disabled = !unlocked || (busy && !button.classList.contains("fd-state-busy"));
    }
    if (refresh) refresh.disabled = busy;
  }

  function showMode(data) {
    if (!current) return;
    const label = LABELS[data?.mode] || "—";
    current.textContent = Number.isInteger(data?.fsm) && label !== "—"
      ? `${label} · FSM ${data.fsm}`
      : label;
  }

  async function runtime(path, options = {}) {
    const request = () => fetch(`/slam-runtime${path}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    let response = await request();
    if (response.status === 401 && options.method === "POST") {
      // Actions need the dashboard's trusted session; obtain it once.
      await fetch("/api/session/bootstrap", { method: "POST", cache: "no-store", credentials: "same-origin" });
      response = await request();
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) {
      throw new Error(body.error || body.detail || body.message || `HTTP ${response.status}`);
    }
    return body;
  }

  async function readMode() {
    if (document.hidden) return;
    try {
      showMode(await runtime("/api/robot/mode"));
    } catch (_) {
      if (current) current.textContent = "—";
    }
  }

  async function setMode(button) {
    const mode = button.dataset.liveRobotMode;
    const label = LABELS[mode] || mode.toUpperCase();
    if (!window.confirm(`Confirm switching the physical robot to ${label} mode?`)) return;
    busy = true;
    button.classList.add("fd-state-busy");  // loading ring until the robot confirms
    syncButtons();
    try {
      const result = await runtime("/api/robot/mode", {
        method: "POST",
        body: JSON.stringify({ mode, password: password.value }),
      });
      showMode(result);
      password.value = "";
    } catch (error) {
      window.alert(`Robot mode ${label} failed: ${error.message || error}`);
    } finally {
      button.classList.remove("fd-state-busy");
      busy = false;
      syncButtons();
      readMode();
    }
  }

  password?.addEventListener("input", syncButtons);
  for (const button of buttons) {
    button.addEventListener("click", () => {
      if (!button.disabled && !busy) setMode(button);
    });
  }
  refresh?.addEventListener("click", readMode);

  syncButtons();
  readMode();
  window.setInterval(readMode, 3000);
})();
