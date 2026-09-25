"use strict";
/*
 * Runtime event stream (the standalone dashboard's /ws WebSocket), reached
 * through the Full Dashboard bridge at /slam-runtime/ws. The runtime only
 * publishes display events there (car state and car command feedback).
 *
 * Every message is listed in the WebSocket card; the frequent car_state
 * messages (pose/scan) are summarized once per second. Car command feedback is
 * also written to the event log, as the standalone dashboard did.
 */
(() => {
  const MAX_LINES = 300;
  const RECONNECT_MS = 3000;
  const box = $("ws-log");
  let socket = null;
  let failures = 0;
  let reconnectTimer = null;
  let stateCount = 0;
  let lastState = null;

  const clock = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

  function write(line) {
    const lines = box.textContent ? box.textContent.split("\n") : [];
    lines.unshift(`[${clock()}] ${line}`);
    box.textContent = lines.slice(0, MAX_LINES).join("\n");
  }

  function summarizeState(message) {
    const parts = [];
    if (message.pose) parts.push(`pose ${message.pose.x.toFixed(2)},${message.pose.y.toFixed(2)}`);
    if (Array.isArray(message.scan_points)) parts.push(`scan ${message.scan_points.length} pts`);
    if (Array.isArray(message.map_points)) parts.push(`map ${message.map_points.length} cells`);
    if (Array.isArray(message.path)) parts.push(`path ${message.path.length} pts`);
    parts.push(message.connected ? "connected" : "disconnected");
    return parts.join(" · ");
  }

  const FEEDBACK = {
    car_path_status: (m) => m.error || `Car planner: ${m.status} · ${m.points || 0} points`,
    car_save_map_status: (m) => m.error || m.message || `Car map save: ${m.status}`,
    car_initial_pose_status: (m) => m.error || m.message || `Car initial pose: ${m.status}`,
    car_map_load_status: (m) => m.error || m.message || `Car map load: ${m.status}`,
    car_mode_status: (m) => `Car mode: ${m.current_mode} / ${m.mode_status}${m.details ? ` · ${m.details}` : ""}`,
    car_maps_list: (m) => `Car maps list: ${(m.maps || []).length} maps`,
  };

  function handle(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch (_) {
      write(`non-JSON message (${raw.length} B)`);
      return;
    }
    // car.js applies car messages exactly like the standalone dashboard.
    window.dispatchEvent(new CustomEvent("runtime-car-message", { detail: message }));
    if (message.type === "car_state") {
      stateCount += 1;
      lastState = message;
      return;
    }
    const describe = FEEDBACK[message.type];
    const text = describe ? translateRuntimeMessage(describe(message)) : JSON.stringify(message).slice(0, 240);
    write(`${message.type || "message"} · ${text}`);
    if (describe && message.type !== "car_maps_list") {
      log(text);
      if (message.error) toast(text, true);
    }
  }

  // One line per second for the frequent car_state updates.
  setInterval(() => {
    if (!stateCount) return;
    write(`car_state ×${stateCount} · ${summarizeState(lastState)}`);
    stateCount = 0;
  }, 1000);

  function connect() {
    reconnectTimer = null;
    if (socket || !window.slamViewVisible()) return;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${scheme}://${location.host}/slam-runtime/ws`);
    socket = ws;
    ws.onopen = () => {
      failures = 0;
      window.slamRuntimeEventsConnected = true;
      write("connected to the runtime event stream");
    };
    ws.onmessage = (event) => handle(event.data);
    ws.onclose = () => {
      window.slamRuntimeEventsConnected = false;
      if (socket !== ws) return;
      socket = null;
      failures += 1;
      if (failures === 1) write("event stream closed; reconnecting…");
      if (failures === 3) {
        write("event stream unavailable · the Full Dashboard bridge must be restarted once to enable /slam-runtime/ws");
      }
      schedule();
    };
  }

  function schedule() {
    if (!reconnectTimer) reconnectTimer = setTimeout(connect, RECONNECT_MS);
  }

  // Connected only while the SLAM tab is visible.
  setInterval(() => {
    if (window.slamViewVisible()) {
      if (!socket) schedule();
    } else if (socket) {
      const ws = socket;
      socket = null;
      window.slamRuntimeEventsConnected = false;
      ws.close();
    }
  }, 1000);

  $("clear-ws-log").addEventListener("click", () => { box.textContent = ""; });
  box.textContent = "";
  connect();
})();
