"use strict";

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(window.location.search);
const suppliedToken = query.get("token");
if (suppliedToken) sessionStorage.setItem("robot_car_nav2_token", suppliedToken);
const token = suppliedToken || sessionStorage.getItem("robot_car_nav2_token") || "";
const runtimePath = (path) => `/slam-runtime${path}`;

// One palette for the 2D map, the 3D view and the legend.
window.SLAM_LAYER_COLORS = Object.freeze({
  robotMap: "#53daf5",
  robot: "#22c55e",
  robotDestination: "#ef4444",
  robotRoute: "#a78bfa",
  carMap: "#f0abfc",
  carScan: "#e2e8f0",
  car: "#fb923c",
  carRoute: "#facc15",
  carDestination: "#3b82f6",
});
const COLORS = window.SLAM_LAYER_COLORS;
document.querySelectorAll(".legend [data-layer]").forEach((swatch) => {
  swatch.style.background = COLORS[swatch.dataset.layer];
});

window.slamTeleopArmed = () => Boolean(state?.locomotion_bridge?.teleop_enabled);

// The Full Dashboard hides this iframe with display:none while another tab is
// active; periodic polling and rendering pause until it is visible again.
window.slamViewVisible = () => !document.hidden
  && (!window.frameElement || window.frameElement.getClientRects().length > 0);
const whenVisible = (task) => () => {
  if (window.slamViewVisible()) task();
};

let state = null;
let mapPoints = [];
let goal = null;
let routePreview = null;
let bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 };
let lastRevision = -1;
// Which robot map the 2D and 3D views show: "live" (current mapping),
// "saved", "partial" or "none" (cleared). view3d follows 'robot-map-source'.
let robotMapSource = { kind: "live" };
let lastLivePointsAt = 0;
const LIVE_POINTS_MIN_INTERVAL_MS = 1000;

function setRobotMapSource(source) {
  robotMapSource = source;
  window.robotMapSource = source;
  window.dispatchEvent(new CustomEvent("robot-map-source", { detail: source }));
}
window.robotMapSource = robotMapSource;

// Progress lines for localization and mapping. While an operation runs its
// steps are shown (and logged); afterwards the line follows the runtime status,
// keeping the final result visible for a few seconds.
const progressHoldUntil = {};
const progressLast = {};
function setProgress(id, text, { tone = "", hold = 0, logIt = false } = {}) {
  const element = $(id);
  if (!element) return;
  element.className = `route-summary${tone ? ` ${tone}` : ""}`;
  element.textContent = text;
  if (hold) progressHoldUntil[id] = Date.now() + hold;
  if (logIt && progressLast[id] !== text) log(text);
  progressLast[id] = text;
}
const progressHeld = (id) => Date.now() < (progressHoldUntil[id] || 0);
let localizedMapName = "";

function syncStatusProgress(next) {
  if (!progressHeld("localization-progress")) {
    const age = Number(next.pose_age);
    if (next.mode === "localization") {
      const where = localizedMapName ? ` on ${localizedMapName}` : "";
      const pose = next.pose || {};
      if (next.pose_age === null || next.pose_age === undefined) {
        setProgress("localization-progress", `Localization started${where} · waiting for the first pose…`, { logIt: true });
      } else if (age > 1.0) {
        setProgress("localization-progress", `Localization pose is stale (${age.toFixed(1)} s)${where}`, { logIt: true });
      } else {
        setProgress("localization-progress",
          `Localized${where} · X ${Number(pose.x || 0).toFixed(2)} Y ${Number(pose.y || 0).toFixed(2)} · pose age ${age.toFixed(2)} s`,
          { tone: "ready" });
      }
    } else {
      setProgress("localization-progress", next.mode === "mapping" ? "Mapping is active · localization is off" : "Not localized");
    }
  }
  if (!progressHeld("mapping-progress-line")) {
    if (next.mode !== "mapping") {
      setProgress("mapping-progress-line", "Mapping idle");
    } else if (next.mapping_error) {
      setProgress("mapping-progress-line", `Mapping problem: ${translateRuntimeMessage(next.mapping_error)}`, { logIt: true });
    } else if (next.mapping_paused) {
      setProgress("mapping-progress-line", `Mapping paused · ${Number(next.scan2d_point_count || 0).toLocaleString("en-US")} cells`, { logIt: true });
    } else if (next.native_mapping_cloud_age === null || next.native_mapping_cloud_age === undefined || next.native_mapping_cloud_age > 2) {
      setProgress("mapping-progress-line", "Mapping started · waiting for the first SLAM cloud…", { logIt: true });
    } else {
      setProgress("mapping-progress-line",
        `Mapping · ${Number(next.scan2d_point_count || 0).toLocaleString("en-US")} cells · ${next.snapshots || 0} captures · cloud age ${Number(next.native_mapping_cloud_age).toFixed(1)} s`,
        { tone: "ready" });
    }
  }
}
let firstMapFrame = true;
let toastTimer = null;
let backendOnline = false;
/*
 * FD21 dashboard-control shell.
 * These endpoints are reserved frontend contracts for the backend stage.
 */
let lastLiveRouteRevision = 0;
let liveRoutePulseTimer = null;

function updateLiveNavigationPath(navigation) {
  const routeStatus = $("live-route-status");
  const points = Array.isArray(navigation.path) ? navigation.path : [];
  const revision = Number(navigation.path_revision || 0);
  const active = Boolean(navigation.path_live) && points.length > 1;
  if (revision < lastLiveRouteRevision) lastLiveRouteRevision = 0;
  if (active && revision > lastLiveRouteRevision) {
    lastLiveRouteRevision = revision;
    routePreview = {
      id: null,
      points,
      target: navigation.goal || null,
      live: true,
      revision,
    };
    if (routeStatus) {
      routeStatus.className = "live-route-status updated";
      clearTimeout(liveRoutePulseTimer);
      liveRoutePulseTimer = setTimeout(() => {
        routeStatus.classList.remove("updated");
      }, 420);
    }
    requestDraw();
  }
  if (!routeStatus) return;
  if (active) {
    const age = Number(navigation.path_updated_age);
    const ageText = Number.isFinite(age) ? `${age.toFixed(1)} s` : "now";
    routeStatus.classList.remove("idle");
    routeStatus.textContent = `Live plan #${revision} · ${points.length} points · ${Number(navigation.replan_count || 0)} updates · ${ageText}`;
  } else if (navigation.state === "previewed") {
    routeStatus.className = "live-route-status idle";
    routeStatus.textContent = "Static preview · the live route starts after confirmation";
  } else if (["completed", "failed", "cancelled", "paused"].includes(navigation.state) && routePreview?.live) {
    routeStatus.className = "live-route-status idle";
    routeStatus.textContent = `Last Nav2 plan #${lastLiveRouteRevision} · navigation no longer updates the route`;
  } else {
    routeStatus.className = "live-route-status idle";
    routeStatus.textContent = "Live Nav2 plan: waiting";
  }
}

let dashboardControlConnected = null;
let pointerInteraction = null;
// Follow target of the 2D and 3D views: null, "robot" or "car".
let followTarget = null;
let stateRefreshRunning = false;
let teleopPendingKey = null;
let teleopKeySending = false;
const heldTeleopKeys = new Map();
let activeTeleopKey = null;
let teleopWasEnabled = false;

/* FD19 — imported perception/backend contract from dashboard_robo_car_nav2. */
let yoloEnabled = false;
let perceptionRefreshRunning = false;
let semanticObjects = [];
let semanticRenderSignature = "";
window.latestSemanticChairMessage = null;

function updateYoloUI(cameraStatus) {
  yoloEnabled = Boolean(cameraStatus.yolo_enabled);
  const input = $("yolo-toggle");
  if (!input) return;
  input.checked = yoloEnabled;
  input.disabled = !cameraStatus.yolo_available;
  input.closest(".fd20-yolo-toggle")?.classList.toggle("is-disabled", input.disabled);
}

function updateSemanticUI(message) {
  window.latestSemanticChairMessage = message;
  semanticObjects = Array.isArray(message.objects) ? message.objects : [];

  const count = $("fd20-semantic-count");
  if (count) count.textContent = String(semanticObjects.length);

  const nextSignature = JSON.stringify({
    calibration: message.calibration_available,
    error: message.calibration_error || "",
    objects: semanticObjects.map((object) => [
      object.id, object.observations, object.aging_value,
      Boolean(object.lidar_supported), Array.isArray(object.points) ? object.points.length : 0,
    ]),
  });

  if (nextSignature !== semanticRenderSignature) {
    semanticRenderSignature = nextSignature;
    window.dispatchEvent(new CustomEvent("semantic-chairs", { detail: message }));
  }
  requestDraw();
}

async function refreshPerception() {
  if (perceptionRefreshRunning) return;
  perceptionRefreshRunning = true;
  try {
    const [cameraStatus, semantic] = await Promise.all([
      api("/api/camera/status"),
      api("/api/semantic/chairs"),
    ]);

    updateYoloUI(cameraStatus);
    updateSemanticUI(semantic);
  } catch (error) {
    /* Camera cards remain visually quiet while camera/backend is unavailable. */
  } finally {
    perceptionRefreshRunning = false;
  }
}

const canvas = $("map");
const ctx = canvas.getContext("2d", { alpha: true });

function fd21NotifyControlState() {
  const explicit =
    state && typeof state.dashboard_control_connected === "boolean"
      ? state.dashboard_control_connected
      : null;

  dashboardControlConnected =
    explicit !== null ? explicit : backendOnline;

  window.dispatchEvent(new CustomEvent("fd21-dashboard-control-state", {
    detail: {
      backendOnline,
      controlConnected: dashboardControlConnected,
    },
  }));
}

async function fd21DashboardControlAction(kind) {
  const endpoint = kind === "connect"
    ? "/api/dashboard/connect"
    : "/api/dashboard/disconnect";

  try {
    const result = await api(endpoint, { method: "POST" });
    if (result && typeof result.connected === "boolean") {
      dashboardControlConnected = result.connected;
    } else {
      dashboardControlConnected = kind === "connect";
    }
    fd21NotifyControlState();
    toast(kind === "connect"
      ? "Dashboard control connected"
      : "Dashboard control released");
    await refreshState();
    return true;
  } catch (error) {
    toast(
      `${kind === "connect" ? "Connect" : "Disconnect"} requires the dashboard-control backend: ${error.message}`,
      true
    );
    fd21NotifyControlState();
    return false;
  }
}

async function fd21ShutdownDashboard() {
  const approved = window.confirm(
    "Close the dashboard completely?\\n\\n"
    + "When the backend shutdown endpoint is implemented, this will release "
    + "dashboard-owned robot resources and stop the dashboard service."
  );
  if (!approved) return false;

  try {
    await api("/api/dashboard/shutdown", { method: "POST" });
    try {
      if (window.parent && window.parent !== window) {
        window.parent.close();
      } else {
        window.close();
      }
    } catch (_) {}
    return true;
  } catch (error) {
    toast(
      `Dashboard shutdown requires the backend shutdown endpoint: ${error.message}`,
      true
    );
    return false;
  }
}

window.fd21DashboardControl = {
  connect: () => fd21DashboardControlAction("connect"),
  disconnect: () => fd21DashboardControlAction("disconnect"),
  shutdown: fd21ShutdownDashboard,
};

function radians(degreesValue) {
  return Number(degreesValue || 0) * Math.PI / 180;
}

function degrees(radiansValue) {
  return Number(radiansValue || 0) * 180 / Math.PI;
}

function toast(message, error = false) {
  const box = $("toast");
  box.textContent = translateRuntimeMessage(message);
  box.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.className = "toast"; }, 4200);
}

function log(message) {
  const clock = new Date().toLocaleTimeString("en-GB", { hour12: false });
  const area = $("log");
  area.textContent = `[${clock}] ${translateRuntimeMessage(message)}\n${area.textContent}`.slice(0, 10000);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers["X-Dashboard-Token"] = token;
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(runtimePath(path), { ...options, headers, cache: "no-store" });
  let body;
  try {
    body = await response.json();
  } catch (_error) {
    throw new Error(`Invalid HTTP response (${response.status})`);
  }
  if (!response.ok) throw new Error(body.detail || body.error || `HTTP ${response.status}`);
  return body;
}

// The Full Dashboard layout removes some standalone status elements
// (connection strip, metric dots); updates to them are skipped.
function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function invalidateRoute(message = "Route not calculated") {
  routePreview = null;
  $("navigate").disabled = true;
  $("route-summary").className = "route-summary";
  setText("route-summary", message);
  requestDraw();
}

function ageLabel(age) {
  if (age === null || age === undefined) return "—";
  if (age < 0.15) return "live · now";
  if (age < 10) return `${age.toFixed(1)} s ago`;
  return `stale · ${Math.round(age)} s`;
}

function velocityLabel(values, age) {
  if (!Array.isArray(values) || values.length < 3) return "—";
  const vector = values.slice(0, 3).map(Number);
  if (!vector.every(Number.isFinite)) return "date invalide";
  const ageValue = Number(age);
  const suffix = age !== null && age !== undefined && Number.isFinite(ageValue)
    ? ` · ${ageValue.toFixed(2)}s`
    : "";
  return `[${vector.map((value) => value.toFixed(2)).join(", ")}]${suffix}`;
}

function yawDiagnosticLabel(diagnostic) {
  const present = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));
  if (![diagnostic?.goal, diagnostic?.map_to_base_link, diagnostic?.goal_error].every(present)) return "—";
  const goalYaw = Number(diagnostic.goal);
  const mapYaw = Number(diagnostic.map_to_base_link);
  const error = Number(diagnostic.goal_error);
  const odom = present(diagnostic?.odom_to_base_link)
    ? ` · odom ${degrees(Number(diagnostic.odom_to_base_link)).toFixed(1)}°`
    : "";
  return `g ${degrees(goalYaw).toFixed(1)}° · map ${degrees(mapYaw).toFixed(1)}°${odom} · Δ ${degrees(error).toFixed(1)}°`;
}

function setHealth(id, age) {
  const dot = $(id);
  if (!dot) return;
  dot.className = "status-dot";
  dot.classList.add(age === null || age === undefined || age > 3 ? "bad" : age > 1.5 ? "warn" : "good");
}

function updateFollowButton() {
  for (const [id, target, label] of [["follow-robot", "robot", "robot"], ["car-center", "car", "car"]]) {
    const button = $(id);
    if (!button) continue;
    const active = followTarget === target;
    button.classList.toggle("active", active);
    button.textContent = active ? `Following ${label}` : `Follow ${label}`;
    button.setAttribute("aria-pressed", String(active));
  }
}

function followTargetPose() {
  if (followTarget === "robot") return state?.pose || null;
  if (followTarget === "car") return window.getCarPose?.() || null;
  return null;
}

function setFollowTarget(target) {
  followTarget = target;
  updateFollowButton();
  window.followTarget = target;
  window.dispatchEvent(new CustomEvent("follow-target", { detail: { target } }));
  requestDraw();
}
window.toggleFollowTarget = (target) => setFollowTarget(followTarget === target ? null : target);
window.getFollowTargetPose = followTargetPose;

function centerOnFollowTarget() {
  const pose = followTargetPose();
  if (!pose) return;
  const rect = canvas.getBoundingClientRect();
  const visibleBounds = boundsForViewport(rect.width, rect.height);
  const spanX = Math.max(10, visibleBounds.maxX - visibleBounds.minX);
  const spanY = Math.max(10, visibleBounds.maxY - visibleBounds.minY);
  const x = Number(pose.x || 0);
  const y = Number(pose.y || 0);
  bounds = {
    minX: x - spanX / 2,
    maxX: x + spanX / 2,
    minY: y - spanY / 2,
    maxY: y + spanY / 2,
  };
}

async function refreshState() {
  if (stateRefreshRunning) return;
  stateRefreshRunning = true;
  try {
    const next = await api("/api/status");
    state = next;
    const justReconnected = !backendOnline;
    backendOnline = true;
    document.documentElement.classList.remove("fd21-backend-offline");
    document.documentElement.classList.add("fd21-backend-online");
    fd21NotifyControlState();
    setText("connection", "Backend connected");
    const odomAge = next.base_odom_age;
    const source = next.localization_input || "ROS 2 topics";
    setText("connection-detail", `${source} · ${next.pose_source || "waiting"}`);
    if ($("connection-dot")) $("connection-dot").className = "status-dot good";

    const mode = next.mode || "idle";
    setText("mode-pill", mode);
    if ($("mode-pill")) $("mode-pill").className = `mode-pill ${mode}`;
    const mappingActive = mode === "mapping";
    $("start-map").disabled = mappingActive;
    $("pause-map").disabled = !mappingActive;
    $("stop-map").disabled = !mappingActive;
    $("save-map").disabled = !mappingActive;
    $("pause-map").textContent =
      next.mapping_paused
        ? "▶ Resume"
        : "Ⅱ Pause";

    $("pause-map").dataset.slamPauseState =
      next.mapping_paused
        ? "resume"
        : "pause";

    /*
     * FULL_DASH_SLAM_MAPPING_STATE_V13
     *
     * Presentation sync is called directly from the existing
     * authoritative SLAM state update.
     *
     * No MutationObserver and no polling loop.
     */
    if (
      typeof window.fullDashSyncMappingV13
      === "function"
    ) {
      window.fullDashSyncMappingV13();
    }
    setText("rmw", next.rmw === "rmw_cyclonedds_cpp" ? "CycloneDDS" : (next.rmw || "RMW necunoscut"));
    const locomotion = next.locomotion_bridge || {};
    const navigation = next.navigation || {};
    const reportedNavigationSpeed = Number(next.navigation_speed);
    if (Number.isFinite(reportedNavigationSpeed) && document.activeElement !== $("speed")) {
      $("speed").value = reportedNavigationSpeed.toFixed(2);
      setText("speed-value", `${reportedNavigationSpeed.toFixed(2)} m/s`);
    }

    /*
     * FULL_DASH_EXACT_CONTROLS_STATE_V15
     * Presentation sync only.
     * Existing API/state logic remains authoritative.
     */
    if (
      typeof window.fullDashSyncV15
      === "function"
    ) {
      window.fullDashSyncV15(next);
    }
    setText("diag-nav2", velocityLabel(navigation.nav2_velocity, navigation.nav2_cmd_age));
    setText("diag-raw", velocityLabel(navigation.raw_velocity, navigation.raw_cmd_age));
    setText("diag-smoothed", velocityLabel(navigation.smoothed_velocity, navigation.smoothed_cmd_age));
    setText("diag-safe", velocityLabel(navigation.safe_velocity, navigation.safe_cmd_age));
    setText("diag-sport", velocityLabel(locomotion.last_velocity, locomotion.last_command_age));
    setText("diag-yaw", yawDiagnosticLabel(next.yaw_diagnostics));
    updateLiveNavigationPath(navigation);
    const reportedTeleopSpeed = Number(locomotion.teleop_speed);
    if (Number.isFinite(reportedTeleopSpeed) && document.activeElement !== $("teleop-speed")) {
      $("teleop-speed").value = reportedTeleopSpeed.toFixed(2);
      setText("teleop-speed-value", `${reportedTeleopSpeed.toFixed(2)} m/s`);
    }
    const reportedTeleopTurnSpeed = Number(locomotion.teleop_turn_speed);
    if (Number.isFinite(reportedTeleopTurnSpeed) && document.activeElement !== $("teleop-turn-speed")) {
      $("teleop-turn-speed").value = reportedTeleopTurnSpeed.toFixed(2);
      setText("teleop-turn-speed-value", `${reportedTeleopTurnSpeed.toFixed(2)} rad/s`);
    }
    const teleopCapture = $("teleop-capture");
    teleopCapture.classList.toggle("active", Boolean(locomotion.teleop_enabled));
    teleopCapture.setAttribute("aria-disabled", String(!locomotion.teleop_enabled));
    setText("robot-mode-state", `FSM: ${next.robot_fsm ?? "unknown"} · service: ${next.motion_service || "unknown"} · RUN requested: ${next.run_profile_accepted ? "accepted" : "not confirmed"}`);
    const teleopEnabled = Boolean(locomotion.teleop_enabled);
    if (teleopWasEnabled && !teleopEnabled && locomotion.teleop_error) {
      const reason = translateRuntimeMessage(locomotion.teleop_error);
      log(`Teleop stopped automatically: ${reason}`);
      toast(`Teleop stopped automatically: ${reason}`, true);
    }
    teleopWasEnabled = teleopEnabled;
    const teleopState = $("teleop-state");
    if (locomotion.teleop_error) {
      teleopState.className = "readiness warn";
      teleopState.textContent = `Teleop stopped · ${translateRuntimeMessage(locomotion.teleop_error)}`;
    } else if (locomotion.teleop_enabled) {
      teleopState.className = locomotion.teleop_verified ? "readiness good" : "readiness warn";
      teleopState.textContent = locomotion.teleop_verified
        ? "Teleop armed · motion confirmed by odometry"
        : locomotion.teleop_process_running
          ? "Teleop armed · the page is listening for keys"
          : "Teleop armed · the keyboard process is not running";
    } else if (locomotion.teleop_verified) {
      teleopState.className = "readiness good";
      teleopState.textContent = "Teleop disarmed · the locomotion test is valid for Nav2";
    } else {
      teleopState.className = "readiness neutral";
      teleopState.textContent = "Teleop disarmed · walking test not performed";
    }
    const requestedMotion = (navigation.teleop_velocity || []).some((value) => Math.abs(Number(value)) > 0.001);
    const forwardedMotion = (locomotion.last_velocity || []).some((value) => Math.abs(Number(value)) > 0.001);
    if (locomotion.teleop_enabled && locomotion.teleop_last_key_age !== null && locomotion.teleop_last_key_age < 2 && requestedMotion && forwardedMotion && locomotion.last_ack) {
      setText("teleop-key-state", `Key ${JSON.stringify(locomotion.teleop_last_key)} arrived · API 7105 accepted`);
    } else if (locomotion.teleop_enabled && locomotion.teleop_last_key_age !== null && locomotion.teleop_last_key_age < 2 && requestedMotion) {
      setText("teleop-key-state", `Key ${JSON.stringify(locomotion.teleop_last_key)} arrived · cmd_vel received, waiting for API 7105`);
    } else if (locomotion.teleop_enabled && locomotion.teleop_last_key_age !== null && locomotion.teleop_last_key_age < 2) {
      setText("teleop-key-state", `Backend received key ${JSON.stringify(locomotion.teleop_last_key)}`);
    } else if (locomotion.teleop_enabled) {
      setText("teleop-key-state", "Ready · press the arrow keys or WASD");
    } else {
      setText("teleop-key-state", "Enable teleop for control");
    }

    const pose = next.pose || { x: 0, y: 0, yaw: 0 };
    setText("pose-x", Number(pose.x || 0).toFixed(2));
    setText("pose-y", Number(pose.y || 0).toFixed(2));
    setText("pose-yaw", `${degrees(pose.yaw).toFixed(1)}°`);
    setText("cloud", next.mapping_paused ? "Pause" : ageLabel(next.scan2d_age));
    setText("odom", ageLabel(odomAge));
    setText("lidar", ageLabel(next.lidar_age));
    setText("points", Number(next.scan2d_point_count || 0).toLocaleString("en-US"));
    if (["previewed", "starting", "navigating", "orienting", "paused", "blocked", "completed", "failed", "cancelled"].includes(navigation.state)) {
      const progress = navigation.waypoints
        ? ` · waypoint ${navigation.waypoint || 0}/${navigation.waypoints}`
        : "";
      const remaining = navigation.remaining !== null && navigation.remaining !== undefined
        && Number.isFinite(Number(navigation.remaining))
        ? ` · ${Number(navigation.remaining).toFixed(2)} m to the waypoint`
        : "";
      const smoothStop = navigation.smooth_stop_active
        ? " · controlled deceleration for replanning"
        : "";
      const livePlan = navigation.path_live
        ? ` · live plan #${Number(navigation.path_revision || 0)}`
        : "";
      $("route-summary").className = `route-summary${navigation.state === "failed" ? "" : " ready"}`;
      setText("route-summary", `${translateRuntimeMessage(navigation.message || navigation.state)}${progress}${remaining}${smoothStop}${livePlan}`);
      if (["starting", "navigating", "orienting", "paused", "completed"].includes(navigation.state)) {
        $("navigate").disabled = true;
      }
    }
    if (next.mapping_paused) {
      if ($("cloud-dot")) $("cloud-dot").className = "status-dot warn";
    } else {
      setHealth("cloud-dot", next.scan2d_age);
    }
    setHealth("odom-dot", odomAge);
    setHealth("lidar-dot", next.lidar_age);

    setText("session-name", next.session || "—");
    setText("snapshots", next.snapshots || 0);
    setText("last-snapshot", next.last_snapshot || "—");
    setText("snapshot-state", next.snapshot_error ? "Error" : next.last_snapshot ? "Saved every 5 s" : "Waiting");
    syncStatusProgress(next);

    if (justReconnected) await refreshMaps();

    if (
      robotMapSource.kind === "live"
      && next.scan2d_revision !== lastRevision
      && Date.now() - lastLivePointsAt >= LIVE_POINTS_MIN_INTERVAL_MS
    ) {
      lastRevision = next.scan2d_revision;
      lastLivePointsAt = Date.now();
      await refreshLivePoints();
    } else {
      requestDraw();
    }
  } catch (error) {
    backendOnline = false;
    document.documentElement.classList.remove("fd21-backend-online");
    document.documentElement.classList.add("fd21-backend-offline");
    fd21NotifyControlState();
    setText("connection", "Backend unavailable");
    setText("connection-detail", error.message);
    if ($("connection-dot")) $("connection-dot").className = "status-dot bad";
  } finally {
    stateRefreshRunning = false;
  }
}

function fitBounds(points) {
  if (!points.length) {
    bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 };
    return;
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point[0]); maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]); maxY = Math.max(maxY, point[1]);
  }
  const spanX = Math.max(maxX - minX, 2);
  const spanY = Math.max(maxY - minY, 2);
  const padding = Math.max(spanX, spanY) * 0.08 + 0.35;
  bounds = { minX: minX - padding, maxX: maxX + padding, minY: minY - padding, maxY: maxY + padding };
}

function setPoints(points, shouldFit = false) {
  mapPoints = (Array.isArray(points) ? points : [])
    .map((raw) => [Number(raw[0]), Number(raw[1]), 0.5])
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  mapPointsRevision += 1;
  // Fit the view once, after the first non-empty cloud.
  if (mapPoints.length && (shouldFit || firstMapFrame)) fitBounds(mapPoints);
  if (followTarget) centerOnFollowTarget();
  if (mapPoints.length) firstMapFrame = false;
  setText("render-count", mapPoints.length.toLocaleString("en-US") + " 2D points");
  $("empty-map").classList.toggle("hidden", mapPoints.length > 0);
  requestDraw();
}

async function refreshLivePoints() {
  const data = await api("/api/map/scan2d?limit=30000");
  setPoints(data.points, firstMapFrame);
  const source = state && state.mapping_backend === "native_slam"
    ? "Stabilized 3D map projected to XY"
    : "Waiting for Mid360 + odometry";
  setText("viewer-subtitle", `${source} · ${Number(data.total).toLocaleString("en-US")} cells`);
}

async function viewSavedMap() {
  const name = $("maps").value;
  if (!name) throw new Error("Select a map first");
  const data = await api(`/api/maps/${encodeURIComponent(name)}/scan2d?limit=70000`);
  firstMapFrame = true;
  setPoints(data.points, true);
  setRobotMapSource({ kind: "saved", name });
  setText("viewer-subtitle", `${data.name} · 2D map · ${Number(data.total).toLocaleString("en-US")} cells`);
  return data;
}

// Uses the selected partial session, or the newest one when none is selected.
async function latestPartial() {
  const select = $("partial-sessions");
  const session = select.value
    || [...select.options].map((option) => option.value).find(Boolean);
  if (!session) throw new Error("No partial mapping session is available");
  const listing = await api(`/api/partial-maps/${encodeURIComponent(session)}`);
  const snapshots = listing.snapshots || [];
  if (!snapshots.length) throw new Error("This session has no PCD capture yet");
  return { session, snapshot: snapshots[snapshots.length - 1] };
}

async function viewLatestPartial() {
  const latest = await latestPartial();
  const data = await api(`/api/partial-maps/${encodeURIComponent(latest.session)}/${encodeURIComponent(latest.snapshot.name)}/scan2d?limit=70000`);
  firstMapFrame = true;
  setPoints(data.points, true);
  setRobotMapSource({ kind: "partial", session: latest.session, snapshot: latest.snapshot.name });
  setText("viewer-subtitle", `${data.session} · ${data.name}.pcd · ${Number(data.total).toLocaleString("en-US")} points`);
  return { success: true, message: `Capture ${data.name} is displayed` };
}

function viewport() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
}

function boundsForViewport(width, height, source = bounds) {
  const usableWidth = Math.max(1, width - 70);
  const usableHeight = Math.max(1, height - 70);
  const targetAspect = usableWidth / usableHeight;
  const centerX = (source.minX + source.maxX) / 2;
  const centerY = (source.minY + source.maxY) / 2;
  let spanX = Math.max(0.1, source.maxX - source.minX);
  let spanY = Math.max(0.1, source.maxY - source.minY);
  if (spanX / spanY < targetAspect) {
    spanX = spanY * targetAspect;
  } else {
    spanY = spanX / targetAspect;
  }
  return {
    minX: centerX - spanX / 2,
    maxX: centerX + spanX / 2,
    minY: centerY - spanY / 2,
    maxY: centerY + spanY / 2,
  };
}

function projection(width, height) {
  const visibleBounds = boundsForViewport(width, height);
  const spanX = visibleBounds.maxX - visibleBounds.minX;
  const spanY = visibleBounds.maxY - visibleBounds.minY;
  const usableWidth = Math.max(1, width - 70);
  const usableHeight = Math.max(1, height - 70);
  const scale = Math.min(usableWidth / spanX, usableHeight / spanY);
  const offsetX = (width - spanX * scale) / 2 - visibleBounds.minX * scale;
  const offsetY = (height - spanY * scale) / 2 + visibleBounds.maxY * scale;
  return {
    scale,
    bounds: visibleBounds,
    point: (x, y) => [offsetX + x * scale, offsetY - y * scale],
    world: (px, py) => [(px - offsetX) / scale, (offsetY - py) / scale],
  };
}

function zoomAt(factor, pixelX, pixelY) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const view = projection(width, height);
  const px = pixelX === undefined ? width / 2 : pixelX;
  const py = pixelY === undefined ? height / 2 : pixelY;
  const anchor = view.world(px, py);
  const spanX = view.bounds.maxX - view.bounds.minX;
  const spanY = view.bounds.maxY - view.bounds.minY;
  const requested = Math.max(0.04, Math.min(25, factor));
  const targetSpan = Math.max(spanX, spanY) * requested;
  if (targetSpan < 0.5 || targetSpan > 500) return;
  const ratioX = (anchor[0] - view.bounds.minX) / spanX;
  const ratioY = (anchor[1] - view.bounds.minY) / spanY;
  const nextSpanX = spanX * requested;
  const nextSpanY = spanY * requested;
  bounds = {
    minX: anchor[0] - ratioX * nextSpanX,
    maxX: anchor[0] + (1 - ratioX) * nextSpanX,
    minY: anchor[1] - ratioY * nextSpanY,
    maxY: anchor[1] + (1 - ratioY) * nextSpanY,
  };
  requestDraw();
}

window.centerOnBounds = function(nextBounds) {
  if (!nextBounds) return;
  bounds = { ...nextBounds };
  requestDraw();
};

function setGoalAt(clientX, clientY) {
  if (window.robotCarPick && window.robotCarPick(clientX, clientY)) return;
  invalidateRoute("Destination changed; preview the route again");
  const rect = canvas.getBoundingClientRect();
  const view = projection(rect.width, rect.height);
  const world = view.world(clientX - rect.left, clientY - rect.top);
  const yaw = radians($("goal-yaw").value);
  goal = { x: world[0], y: world[1], yaw };
  $("goal-x").value = world[0].toFixed(2);
  $("goal-y").value = world[1].toFixed(2);
  requestDraw();
  toast(`Destination selected: X ${world[0].toFixed(2)}, Y ${world[1].toFixed(2)}, yaw ${degrees(yaw).toFixed(0)}°`);
}

function niceStep(span) {
  const rough = span / 10;
  const power = 10 ** Math.floor(Math.log10(Math.max(rough, 0.001)));
  const ratio = rough / power;
  return (ratio >= 5 ? 5 : ratio >= 2 ? 2 : 1) * power;
}

// Grid, car layers and SLAM points are rendered into a cached layer that is
// rebuilt only when the view, the points or the car layers change; pointer
// drags and state ticks only repaint the overlay on top of it.
const baseLayer = document.createElement("canvas");
let baseLayerKey = "";
let mapPointsRevision = 0;

function drawBaseLayer(layer, view, width, height) {
  const visibleBounds = view.bounds;
  const step = niceStep(Math.max(
    visibleBounds.maxX - visibleBounds.minX,
    visibleBounds.maxY - visibleBounds.minY,
  ));

  layer.lineWidth = 1;
  layer.strokeStyle = "rgba(104, 133, 171, .11)";
  layer.fillStyle = "rgba(131, 150, 178, .46)";
  layer.font = "9px ui-monospace, monospace";
  for (let x = Math.ceil(visibleBounds.minX / step) * step; x <= visibleBounds.maxX + step * .01; x += step) {
    const [px] = view.point(x, 0);
    layer.strokeStyle = Math.abs(x) < step * 0.01 ? "rgba(239,89,103,.30)" : "rgba(104,133,171,.11)";
    layer.beginPath(); layer.moveTo(px, 0); layer.lineTo(px, height); layer.stroke();
    if (px > 4 && px < width - 28) layer.fillText(`${Number(x.toFixed(2))}m`, px + 3, height - 8);
  }
  for (let y = Math.ceil(visibleBounds.minY / step) * step; y <= visibleBounds.maxY + step * .01; y += step) {
    const [, py] = view.point(0, y);
    layer.strokeStyle = Math.abs(y) < step * 0.01 ? "rgba(83,214,139,.30)" : "rgba(104,133,171,.11)";
    layer.beginPath(); layer.moveTo(0, py); layer.lineTo(width, py); layer.stroke();
    if (py > 12 && py < height - 4) layer.fillText(`${Number(y.toFixed(2))}m`, 7, py - 4);
  }

  // The XY projection comes from the stabilized 3D map; the browser only draws it.
  if (window.drawRobotCarLayers) window.drawRobotCarLayers(layer, view);
  if (!$("robot-show-map")?.checked) return;
  const pointSize = 2;
  const screenCell = 1.35;
  const columns = Math.ceil(width / screenCell) + 1;
  const occupied = new Set();
  layer.save();
  layer.fillStyle = COLORS.robotMap;
  for (const point of mapPoints) {
    if (point[0] < visibleBounds.minX || point[0] > visibleBounds.maxX || point[1] < visibleBounds.minY || point[1] > visibleBounds.maxY) continue;
    const [px, py] = view.point(point[0], point[1]);
    const key = Math.floor(py / screenCell) * columns + Math.floor(px / screenCell);
    if (occupied.has(key)) continue;
    occupied.add(key);
    layer.fillRect(px - pointSize / 2, py - pointSize / 2, pointSize, pointSize);
  }
  layer.restore();
}

function draw() {
  if (followTarget) centerOnFollowTarget();
  const { width, height } = viewport();
  const view = projection(width, height);
  const key = [
    canvas.width, canvas.height,
    view.bounds.minX, view.bounds.maxX, view.bounds.minY, view.bounds.maxY,
    mapPointsRevision, window.robotCarLayersRevision || 0,
  ].join("|");
  if (key !== baseLayerKey) {
    if (baseLayer.width !== canvas.width) baseLayer.width = canvas.width;
    if (baseLayer.height !== canvas.height) baseLayer.height = canvas.height;
    const layer = baseLayer.getContext("2d");
    layer.setTransform(1, 0, 0, 1, 0, 0);
    layer.clearRect(0, 0, baseLayer.width, baseLayer.height);
    layer.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    drawBaseLayer(layer, view, width, height);
    baseLayerKey = key;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(baseLayer, 0, 0);
  ctx.restore();

  if (window.drawRobotCarOverlay) window.drawRobotCarOverlay(ctx, view);

  if (routePreview && routePreview.points.length > 1) {
    ctx.save();
    ctx.strokeStyle = COLORS.robotRoute;
    ctx.lineWidth = 3;
    ctx.setLineDash(routePreview.live ? [] : [8, 5]);
    ctx.beginPath();
    routePreview.points.forEach((point, index) => {
      const projected = view.point(Number(point[0]), Number(point[1]));
      if (index === 0) ctx.moveTo(projected[0], projected[1]);
      else ctx.lineTo(projected[0], projected[1]);
    });
    ctx.stroke();
    ctx.restore();
  }

  if (semanticObjects.length) {
    ctx.save();
    ctx.font = "700 10px ui-monospace, monospace";
    ctx.textAlign = "center";
    for (const object of semanticObjects) {
      const minimum = object.bounds?.min;
      const maximum = object.bounds?.max;
      if (!minimum || !maximum) continue;
      const [x1, y1] = view.point(Number(minimum.x), Number(minimum.y));
      const [x2, y2] = view.point(Number(maximum.x), Number(maximum.y));
      const left = Math.min(x1, x2), top = Math.min(y1, y2);
      const width = Math.max(5, Math.abs(x2 - x1)), height = Math.max(5, Math.abs(y2 - y1));
      const aging = Math.max(0, Number(object.aging_value || 0));
      const cap = Math.max(1, Number(object.aging_cap || 100));
      const ratio = Math.min(1, aging / cap);
      ctx.strokeStyle = ratio > .5 ? "#c084fc" : ratio > .25 ? "#f59e0b" : "#ef4444";
      ctx.fillStyle = "rgba(168,85,247,.12)";
      ctx.lineWidth = 2;
      ctx.fillRect(left, top, width, height);
      ctx.strokeRect(left, top, width, height);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(object.name || `chair ${object.id}`, left + width / 2, top - 5);
    }
    ctx.restore();
  }

  if (state && state.pose) {
    const pose = state.pose;
    const [rx, ry] = view.point(Number(pose.x || 0), Number(pose.y || 0));
    const angle = -Number(pose.yaw || 0);
    ctx.save(); ctx.translate(rx, ry); ctx.rotate(angle);
    ctx.fillStyle = COLORS.robot; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, -6); ctx.lineTo(-4, 0); ctx.lineTo(-7, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  if (goal) {
    const [gx, gy] = view.point(goal.x, goal.y);
    const yaw = Number(goal.yaw === undefined ? radians($("goal-yaw").value) : goal.yaw);
    const arrowX = gx + Math.cos(yaw) * 25;
    const arrowY = gy - Math.sin(yaw) * 25;
    ctx.strokeStyle = COLORS.robotDestination; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(gx, gy, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx - 12, gy); ctx.lineTo(gx + 12, gy); ctx.moveTo(gx, gy - 12); ctx.lineTo(gx, gy + 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(arrowX, arrowY); ctx.stroke();
    ctx.save(); ctx.translate(arrowX, arrowY); ctx.rotate(-yaw);
    ctx.fillStyle = COLORS.robotDestination;
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

let pendingDrawFrame = null;
function requestDraw() {
  if (pendingDrawFrame !== null) return;
  pendingDrawFrame = window.requestAnimationFrame(() => {
    pendingDrawFrame = null;
    draw();
  });
}

async function action(button, busyText, operation) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  window.slamButtonBusy?.(button, true);
  try {
    const result = await operation();
    const message = result.message || (result.success ? "Command confirmed" : result.error) || "Operation finished";
    if (result.success === false) throw new Error(message);
    log(message);
    toast(message);
    return result;
  } catch (error) {
    log(`ERROR: ${error.message}`);
    toast(error.message, true);
    return null;
  } finally {
    button.disabled = false;
    button.textContent = original;
    window.slamButtonBusy?.(button, false);
    await refreshState();
  }
}

async function refreshMaps() {
  try {
    const data = await api("/api/maps");
    const select = $("maps");
    const previous = select.value;
    select.innerHTML = '<option value="">Select a map…</option>';
    for (const item of data.maps || []) {
      const option = document.createElement("option");
      option.value = item.name;
      option.textContent = `${item.name} · ${(item.size / 1024 / 1024).toFixed(1)} MB${item.native_ready ? " · navigable" : " · view only"}`;
      option.dataset.nativeReady = String(Boolean(item.native_ready));
      select.appendChild(option);
    }
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;

    const partialSelect = $("partial-sessions");
    const previousPartial = partialSelect.value;
    const sessionCount = (data.partial_sessions || []).length;
    partialSelect.innerHTML = `<option value="">${sessionCount ? "Newest session" : "No saved sessions"}</option>`;
    for (const item of data.partial_sessions || []) {
      const option = document.createElement("option");
      option.value = item.name;
      option.textContent = `${item.name} · ${item.snapshots} captures`;
      partialSelect.appendChild(option);
    }
    if ([...partialSelect.options].some((option) => option.value === previousPartial)) partialSelect.value = previousPartial;
    updateMapReadiness();
  } catch (error) {
    log(`ERROR loading the map list: ${error.message}`);
  }
}

function updateMapReadiness() {
  const option = $("maps").selectedOptions[0];
  const box = $("map-readiness");
  if (!option || !option.value) {
    box.className = "readiness neutral";
    box.textContent = "No map selected";
  } else if (option.dataset.nativeReady === "true") {
    box.className = "readiness good";
    box.textContent = "Map ready for localization and navigation";
  } else {
    box.className = "readiness warn";
    box.textContent = "Local copy available; service 1802 did not confirm the native map";
  }
}

$("start-map").addEventListener("click", async (event) => {
  setProgress("mapping-progress-line", "Starting native mapping (API 1801)…", { hold: 15000, logIt: true });
  await action(event.currentTarget, "Waiting for the first cloud…", async () => {
    setRobotMapSource({ kind: "live" });
    lastRevision = -1;
    firstMapFrame = true;
    setFollowTarget(null);
    goal = null;
    const result = await api("/api/slam/start_mapping", { method: "POST" });
    if (result.success) setText("viewer-subtitle", "Stabilized 3D map projected to XY · new session");
    return result;
  });
});

$("pause-map").addEventListener("click", async (event) => {
  await action(event.currentTarget, "Switching…", () => api("/api/slam/pause_mapping", {
    method: "POST",
  }));
});

$("stop-map").addEventListener("click", async (event) => {
  setProgress("mapping-progress-line", "Stopping mapping…", { hold: 15000, logIt: true });
  const result = await action(event.currentTarget, "Stopping…", () => api("/api/slam/stop_mapping", {
    method: "POST",
  }));
  setProgress("mapping-progress-line", result ? "Mapping stopped; partial captures were kept" : "Stopping mapping failed · see the log", { hold: 8000 });
  if (result) await refreshMaps();
});

$("save-map").addEventListener("click", async (event) => {
  const name = $("map-name").value.trim();
  if (!name) return toast("Enter a map name", true);
  setProgress("mapping-progress-line", `Saving map ${name} (API 1802)…`, { hold: 30000, logIt: true });
  const result = await action(event.currentTarget, "Saving…", () => api("/api/slam/save_map", {
    method: "POST", body: JSON.stringify({ name }),
  }));
  setProgress("mapping-progress-line", result ? `Map ${name} saved` : `Saving ${name} failed · see the log`, { tone: result ? "ready" : "", hold: 10000 });
  if (result) await refreshMaps();
});

$("refresh-maps").addEventListener("click", refreshMaps);
$("refresh-partials").addEventListener("click", refreshMaps);
// Selecting a map does not load it; View map or Load & Localize does.
$("maps").addEventListener("change", () => {
  updateMapReadiness();
  invalidateRoute("Selected map changed; preview the route again");
});
$("view-map").addEventListener("click", async (event) => {
  await action(event.currentTarget, "Loading…", viewSavedMap);
});
$("download-map").addEventListener("click", () => {
  const name = $("maps").value;
  if (!name) return toast("Select a map first", true);
  window.location.href = runtimePath(`/api/maps/${encodeURIComponent(name)}/file`);
});
// Removes the robot map from the 2D and 3D views only; PCD files are kept.
$("clear-view").addEventListener("click", () => {
  mapPoints = [];
  mapPointsRevision += 1;
  goal = null;
  firstMapFrame = true;
  bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 };
  $("maps").value = "";
  $("maps").dispatchEvent(new Event("change"));
  setRobotMapSource({ kind: "none" });
  invalidateRoute("View cleared; continue mapping or load another map");
  $("empty-map").classList.remove("hidden");
  setText("viewer-subtitle", "Empty view · PCD files were not deleted");
  setText("render-count", "0 visible points");
  toast("The map was removed from the view only; its file is still saved");
});
$("view-partial").addEventListener("click", async (event) => {
  await action(event.currentTarget, "Loading…", viewLatestPartial);
});
$("download-partial").addEventListener("click", async () => {
  try {
    const latest = await latestPartial();
    window.location.href = runtimePath(`/api/partial-maps/${encodeURIComponent(latest.session)}/${encodeURIComponent(latest.snapshot.name)}/file`);
  } catch (error) {
    toast(error.message, true);
  }
});

$("localize").addEventListener("click", async (event) => {
  const map = $("maps").value;
  if (!map) return toast("Select a map first", true);
  const step = (text) => setProgress("localization-progress", text, { hold: 60000, logIt: true });
  const result = await action(event.currentTarget, "Loading and localizing…", async () => {
    // Loading a map and starting native localization are distinct operations.
    // Always render the selected PCD first so a localization precondition
    // failure cannot leave the viewer looking empty.
    step(`1/3 Loading map ${map}…`);
    await viewSavedMap();
    step(`2/3 Starting native localization on ${map} (API 1804); this can take up to 10 s…`);
    return api("/api/localization/start", {
      method: "POST",
      body: JSON.stringify({
        map,
        x: Number($("loc-x").value), y: Number($("loc-y").value), yaw: radians($("loc-yaw").value),
      }),
    });
  });
  if (result) {
    localizedMapName = map;
    setProgress("localization-progress", `3/3 Localized on ${map}; following the live pose…`, { tone: "ready", hold: 4000, logIt: true });
  } else {
    setProgress("localization-progress", `Localization on ${map} failed · see the log`, { hold: 15000 });
  }
});

function navigationTarget() {
  const x = Number($("goal-x").value);
  const y = Number($("goal-y").value);
  const yaw = radians($("goal-yaw").value);
  const speed = Number($("speed").value);
  return { x, y, yaw, speed, map: $("maps").value };
}

// Nav2 cannot finish a route whose goal lies inside the robot footprint
// (half-width 0.33 m) around a mapped obstacle; the planner's 0.25 m goal
// tolerance lets such a preview pass and the route is aborted while driving.
const GOAL_MIN_CLEARANCE_M = 0.35;

function goalClearance(x, y) {
  let nearest = Infinity;
  for (const point of mapPoints) {
    const distance = Math.hypot(point[0] - x, point[1] - y);
    if (distance < nearest) nearest = distance;
  }
  return nearest;
}

$("preview-route").addEventListener("click", async (event) => {
  const target = navigationTarget();
  goal = { x: target.x, y: target.y, yaw: target.yaw };
  const clearance = goalClearance(target.x, target.y);
  if (clearance < GOAL_MIN_CLEARANCE_M) {
    const message = `The destination is ${Math.round(clearance * 100)} cm from a mapped obstacle; `
      + `choose a point at least ${Math.round(GOAL_MIN_CLEARANCE_M * 100)} cm from walls.`;
    invalidateRoute(message);
    log(`ERROR: ${message}`);
    toast(message, true);
    return;
  }
  const result = await action(event.currentTarget, "Computing with Nav2…", () => api("/api/navigation/preview", {
    method: "POST", body: JSON.stringify(target),
  }));
  if (!result) return;
  routePreview = {
    id: result.preview_id,
    points: result.route.points || [],
    target,
  };
  const distance = Number(result.route.distance || 0);
  $("route-summary").className = "route-summary ready";
  setText("route-summary", `Route ready · ${distance.toFixed(2)} m · ${routePreview.points.length} points · confirm within 120 s`);
  $("navigate").disabled = false;
  requestDraw();
});

$("navigate").addEventListener("click", async (event) => {
  if (!routePreview) return toast("Preview the route first", true);
  const target = navigationTarget();
  if (!window.confirm(`CONFIRM NAV2 WITH EXCLUSIVE CONTROL\nConfirm that native navigation and all other motion sources are stopped.\nX=${target.x.toFixed(2)}, Y=${target.y.toFixed(2)}, yaw=${degrees(target.yaw).toFixed(0)}°, speed=${target.speed.toFixed(2)} m/s. The robot may start moving. Continue?`)) return;
  const result = await action(event.currentTarget, "Starting route…", () => api("/api/navigation/goal", {
    method: "POST",
    body: JSON.stringify({ ...target, preview_id: routePreview.id, exclusive_control: true }),
  }));
  if (result) {
    $("navigate").disabled = true;
    $("route-summary").className = "route-summary ready";
    setText("route-summary", translateRuntimeMessage(result.message || "Nav2 started the route"));
    requestDraw();
  }
});

$("stop-navigation").addEventListener("click", (event) => action(event.currentTarget, "Stopping route…", () => api("/api/navigation/stop", { method: "POST" })));
$("pause").addEventListener("click", (event) => action(event.currentTarget, "Pausing…", () => api("/api/navigation/pause", { method: "POST" })));
$("resume").addEventListener("click", (event) => action(event.currentTarget, "Resuming…", () => api("/api/navigation/resume", { method: "POST" })));
$("speed").addEventListener("input", () => {
  setText("speed-value", `${Number($("speed").value).toFixed(2)} m/s`);
  invalidateRoute("Speed changed; preview the route again");
});

$("speed").addEventListener("change", async () => {
  try {
    await api("/api/navigation/speed", {
      method: "POST",
      body: JSON.stringify({ speed: Number($("speed").value) }),
    });
    await refreshState();
  } catch (error) {
    toast(error.message, true);
    await refreshState();
  }
});

$("teleop-speed").addEventListener("input", () => {
  setText("teleop-speed-value", `${Number($("teleop-speed").value).toFixed(2)} m/s`);
});

$("teleop-turn-speed").addEventListener("input", () => {
  setText("teleop-turn-speed-value", `${Number($("teleop-turn-speed").value).toFixed(2)} rad/s`);
});

async function saveTeleopSpeeds() {
  const speed = Number($("teleop-speed").value);
  const turnSpeed = Number($("teleop-turn-speed").value);
  try {
    const result = await api("/api/teleop/speed", {
      method: "POST",
      body: JSON.stringify({ speed, turn_speed: turnSpeed }),
    });
    log(result.message);
    toast(result.message);
    await refreshState();
  } catch (error) {
    log(`ERROR setting the teleop speed: ${error.message}`);
    toast(error.message, true);
    await refreshState();
  }
}

$("teleop-speed").addEventListener("change", saveTeleopSpeeds);
$("teleop-turn-speed").addEventListener("change", saveTeleopSpeeds);
["goal-x", "goal-y"].forEach((id) => {
  $(id).addEventListener("input", () => invalidateRoute("Destination changed; preview the route again"));
});

function updateModeControls() {
  const unlocked = $("mode-password").value === "123";
  document.querySelectorAll("[data-robot-mode]").forEach((button) => {
    button.disabled = !unlocked;
  });
  $("enable-teleop").disabled = !unlocked;
}

$("mode-password").addEventListener("input", updateModeControls);

// After teleop stops, the previous keyboard node stays visible in the ROS
// graph until its DDS lease expires; the backend refuses a new session while
// that publisher is still listed, so the request is retried for that window.
const TELEOP_PUBLISHER_RELEASE_MS = 12000;

async function requestTeleopEnable() {
  const deadline = Date.now() + TELEOP_PUBLISHER_RELEASE_MS;
  for (;;) {
    const result = await api("/api/teleop/enable", {
      method: "POST",
      body: JSON.stringify({
        password: $("mode-password").value,
        exclusive_control: true,
        speed: Number($("teleop-speed").value),
        turn_speed: Number($("teleop-turn-speed").value),
      }),
    });
    const stalePublisher = result.success === false
      && String(result.error || "").includes("publisher extern pe /cmd_vel_teleop");
    if (!stalePublisher || Date.now() >= deadline) return result;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

$("enable-teleop").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (!window.confirm("CONFIRM EXCLUSIVE TELEOP\nThe robot is in a free area and the joystick and all other motion sources are stopped. This activates RUN and the keyboard teleop. The next key pressed on this page can move the robot. Continue?")) return;
  const result = await action(button, "Arming…", requestTeleopEnable);
  if (result) {
    button.blur();
    $("mode-password").value = "";
    updateModeControls();
    // Keys are captured on the window; leave no text field focused.
    document.activeElement?.blur();
  }
});

$("disable-teleop").addEventListener("click", (event) => action(
  event.currentTarget,
  "Stopping…",
  () => api("/api/teleop/disable", { method: "POST" }),
));

function teleopKeyForEvent(event) {
  const physicalKeys = {
    ArrowUp: "i", ArrowDown: ",", ArrowLeft: "j", ArrowRight: "l",
    KeyW: "i", KeyS: ",", KeyA: "j", KeyD: "l", Space: "k",
  };
  if (physicalKeys[event.code] !== undefined) return physicalKeys[event.code];
  const aliases = {
    " ": "k",
  };
  if (aliases[event.key] !== undefined) return aliases[event.key];
  const standard = "uiojklm,.UIOJKLM<>";
  return event.key.length === 1 && standard.includes(event.key) ? event.key : null;
}

function editableTarget(target) {
  return target instanceof HTMLElement && (
    target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

async function pumpTeleopKeys() {
  if (teleopKeySending) return;
  teleopKeySending = true;
  try {
    while (teleopPendingKey !== null) {
      const key = teleopPendingKey;
      teleopPendingKey = null;
      const result = await api("/api/teleop/key", {
        method: "POST",
        body: JSON.stringify({ key }),
      });
      if (result.success === false) throw new Error(result.error || "The teleop command was rejected");
      setText("teleop-key-state", `Backend received key ${JSON.stringify(key)}`);
    }
  } catch (error) {
    teleopPendingKey = null;
    log(`ERROR teleop: ${error.message}`);
    toast(error.message, true);
  } finally {
    teleopKeySending = false;
    if (teleopPendingKey !== null) pumpTeleopKeys();
  }
}

function sendTeleopKey(key) {
  teleopPendingKey = key;
  pumpTeleopKeys();
}

function teleopIsEnabled() {
  return Boolean(state?.locomotion_bridge?.teleop_enabled);
}

function stopHeldTeleopKeys() {
  if (!heldTeleopKeys.size && activeTeleopKey === null) return;
  heldTeleopKeys.clear();
  activeTeleopKey = null;
  sendTeleopKey("k");
}

window.addEventListener("keydown", (event) => {
  if (!teleopIsEnabled() || editableTarget(event.target)) return;
  const key = teleopKeyForEvent(event);
  if (key === null) return;
  event.preventDefault();
  event.stopPropagation();
  if (key === "k") {
    stopHeldTeleopKeys();
    sendTeleopKey("k");
    return;
  }
  const motionKeys = "uiojlm,.UIOJKLM<>";
  if (motionKeys.includes(key)) {
    heldTeleopKeys.set(event.code, key);
    activeTeleopKey = key;
    if (event.repeat) return;
  }
  sendTeleopKey(key);
}, { capture: true });

window.addEventListener("keyup", (event) => {
  if (!heldTeleopKeys.delete(event.code)) return;
  event.preventDefault();
  event.stopPropagation();
  const remaining = Array.from(heldTeleopKeys.values());
  activeTeleopKey = remaining.length ? remaining[remaining.length - 1] : null;
  sendTeleopKey(activeTeleopKey || "k");
}, { capture: true });

window.addEventListener("blur", () => {
  stopHeldTeleopKeys();
});


// teleop_twist_keyboard publishes once per character; the active key is
// repeated here so motion does not depend on the OS keyboard auto-repeat delay.
setInterval(() => {
  if (activeTeleopKey !== null && teleopIsEnabled()) sendTeleopKey(activeTeleopKey);
}, 100);

document.querySelectorAll("[data-robot-mode]").forEach((button) => {
  button.addEventListener("click", async (event) => {
    const mode = button.dataset.robotMode;
    if (!window.confirm(`Confirm switching the physical robot to ${mode.toUpperCase()} mode?`)) return;
    const result = await action(event.currentTarget, "Sending…", () => api("/api/robot/mode", {
      method: "POST",
      body: JSON.stringify({ mode, password: $("mode-password").value }),
    }));
    if (result) {
      $("mode-password").value = "";
      updateModeControls();
      invalidateRoute("Robot mode changed; preview the route again");
    }
  });
});

$("yolo-toggle")?.addEventListener("change", async (event) => {
  const input = event.currentTarget;
  const requested = Boolean(input.checked);
  input.disabled = true;
  try {
    const result = await api("/api/yolo/toggle", {
      method: "POST",
      body: JSON.stringify({ enabled: requested }),
    });
    yoloEnabled = Boolean(result?.enabled ?? requested);
  } catch (error) {
    input.checked = yoloEnabled;
    if (typeof toast === "function") toast(error.message, true);
  } finally {
    await refreshPerception();
  }
});

$("semantic-clear")?.addEventListener("click", async (event) => {
  await action(event.currentTarget, "Clearing…", () => api("/api/semantic/chairs", { method: "DELETE" }));
  await refreshPerception();
});

$("fit-map").addEventListener("click", () => {
  setFollowTarget(null);
  fitBounds(mapPoints);
  requestDraw();
});
$("follow-robot").addEventListener("click", () => window.toggleFollowTarget("robot"));
$("clear-log").addEventListener("click", () => { $("log").textContent = ""; });

$("goal-yaw").addEventListener("input", () => {
  invalidateRoute("Final orientation changed; preview the route again");
  if (goal) goal.yaw = radians($("goal-yaw").value);
  requestDraw();
});

$("robot-show-map").addEventListener("change", () => {
  mapPointsRevision += 1;
  window.dispatchEvent(new CustomEvent("robot-map-visibility", {
    detail: { visible: $("robot-show-map").checked },
  }));
  requestDraw();
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  zoomAt(event.deltaY > 0 ? 1.14 : 0.88, event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });

window.setG1Goal = (x, y, yaw, invalidate = true) => {
  if (invalidate) invalidateRoute("Destination changed; preview the route again");
  goal = { x: Number(x), y: Number(y), yaw: Number(yaw) };
  if ($("goal-x")) $("goal-x").value = Number(x).toFixed(2);
  if ($("goal-y")) $("goal-y").value = Number(y).toFixed(2);
  if ($("goal-yaw")) $("goal-yaw").value = degrees(yaw).toFixed(1);
  requestDraw();
};
window.getG1Goal = () => goal;
window.projection = projection;
window.degrees = degrees;
window.radians = radians;
window.requestDraw = requestDraw;
window.invalidateRoute = invalidateRoute;

canvas.addEventListener("contextmenu", (event) => event.preventDefault());

canvas.addEventListener("pointerdown", (event) => {
  const isPanButton = event.button === 1 || event.button === 2;
  if (!isPanButton && !(event.button === 0 && event.altKey)) return;
  const rect = canvas.getBoundingClientRect();
  const view = projection(rect.width, rect.height);
  pointerInteraction = {
    mode: "pan",
    startX: event.clientX,
    startY: event.clientY,
    startBounds: { ...view.bounds },
    scale: view.scale,
    moved: false,
  };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointerInteraction) return;
  const dx = event.clientX - pointerInteraction.startX;
  const dy = event.clientY - pointerInteraction.startY;
  if (Math.hypot(dx, dy) > 3) pointerInteraction.moved = true;
  if (pointerInteraction.mode === "pan") {
    if (pointerInteraction.moved && followTarget) setFollowTarget(null);
    const original = pointerInteraction.startBounds;
    const shiftX = -dx / pointerInteraction.scale;
    const shiftY = dy / pointerInteraction.scale;
    bounds = {
      minX: original.minX + shiftX, maxX: original.maxX + shiftX,
      minY: original.minY + shiftY, maxY: original.maxY + shiftY,
    };
  }
  canvas.style.cursor = pointerInteraction.mode === "pan" ? "grabbing" : "crosshair";
  requestDraw();
});

function finishPointer(event) {
  if (!pointerInteraction) return;
  pointerInteraction = null;
  canvas.style.cursor = "crosshair";
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

canvas.addEventListener("pointerup", finishPointer);
canvas.addEventListener("pointercancel", finishPointer);

window.addEventListener("resize", requestDraw);
refreshMaps();
updateFollowButton();
document.documentElement.classList.add("fd21-backend-offline");
fd21NotifyControlState();
refreshState();
refreshPerception();
setInterval(whenVisible(refreshState), 500);
setInterval(whenVisible(refreshPerception), 1000);
setInterval(whenVisible(refreshMaps), 5000);
