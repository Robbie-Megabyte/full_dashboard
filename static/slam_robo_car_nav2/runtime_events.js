"use strict";
/*
 * Runtime event stream (the standalone dashboard's /ws WebSocket), reached
 * through the Full Dashboard bridge at /slam-runtime/ws. The runtime only
 * publishes display events there (car state and car command feedback).
 *
 * Car command feedback is written to the event log (and errors shown as
 * toasts), as the standalone dashboard did.
 */
(() => {
  const RECONNECT_MS = 3000;
  let socket = null;
  let failures = 0;
  let reconnectTimer = null;

  const FEEDBACK = {
    car_path_status: (m) => m.error || `Car planner: ${m.status} · ${m.points || 0} points`,
    car_save_map_status: (m) => m.error || m.message || `Car map save: ${m.status}`,
    car_initial_pose_status: (m) => m.error || m.message || `Car initial pose: ${m.status}`,
    car_map_load_status: (m) => m.error || m.message || `Car map load: ${m.status}`,
    car_servo_offset_status: (m) => m.error || `Wheel offset set to ${m.value}`,
    car_navigation_status: (m) => m.error || (m.status === "cancelled" ? `Car navigation stopped · ${m.goals || 0} goal(s) cancelled` : `Car navigation: ${m.status}`),
    car_mode_status: (m) => `Car mode: ${m.current_mode} / ${m.mode_status}${m.details ? ` · ${m.details}` : ""}`,
    car_maps_list: (m) => `Car maps list: ${(m.maps || []).length} maps`,
  };

  function handle(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch (_) {
      return;
    }
    // car.js applies car messages exactly like the standalone dashboard.
    window.dispatchEvent(new CustomEvent("runtime-car-message", { detail: message }));
    const describe = FEEDBACK[message.type];
    if (!describe) return;
    const text = translateRuntimeMessage(describe(message));
    if (message.type !== "car_maps_list") {
      log(text);
      if (message.error) toast(text, true);
    }
  }

  function connect() {
    reconnectTimer = null;
    if (socket || !window.slamViewVisible()) return;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${scheme}://${location.host}/slam-runtime/ws`);
    socket = ws;
    ws.onopen = () => {
      failures = 0;
      window.slamRuntimeEventsConnected = true;
    };
    ws.onmessage = (event) => handle(event.data);
    ws.onclose = () => {
      window.slamRuntimeEventsConnected = false;
      if (socket !== ws) return;
      socket = null;
      failures += 1;

      if (failures === 3) {
        log("Event stream unavailable · the Full Dashboard bridge must be restarted once to enable /slam-runtime/ws");
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

  connect();
})();
