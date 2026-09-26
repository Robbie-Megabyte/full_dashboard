"use strict";
// Car extension of the SLAM tab. It never sends G1 locomotion commands.
(() => {
  const COLORS = window.SLAM_LAYER_COLORS;
  let car = {}, previewId = null, polling = false, pollCount = 0;
  const val = id => Number($(id).value);
  const pose = prefix => ({x: val(`${prefix}-x`), y: val(`${prefix}-y`), yaw_deg: val(`${prefix}-yaw`)});
  const post = (path, body = {}) => api(path, {method: 'POST', body: JSON.stringify(body)});
  const say = text => { $('car-result').textContent = text; log(text); };
  const carMapVisible = () => $('car-show-map').checked;
  const layerSignature = items => {
    const list = Array.isArray(items) ? items : [];
    const first = list[0], last = list[list.length - 1];
    return `${list.length}:${first?.x},${first?.y}:${last?.x},${last?.y}`;
  };
  let lastLayerSignature = '';
  window.robotCarLayersRevision = 0;
  function update(data) {
    car = {...car, ...data};
    // The live scan is redrawn in the overlay; only the map and the route
    // invalidate the cached base layer.
    const layers = [car.map_points, car.path].map(layerSignature).join('|');
    if (layers !== lastLayerSignature) {
      lastLayerSignature = layers;
      window.robotCarLayersRevision += 1;
    }
    window.dispatchEvent(new CustomEvent('robot-car-state', { detail: car }));
    updateScanMatch();
    trackCarArrival();
    renderCarStatus();
    $('car-go').disabled = !(car.preview?.ready && car.preview.request_id === previewId);
    if (!car.connected) previewId = null;
    const maps = car.available_maps || [];
    const select = $('car-maps');
    const signature = JSON.stringify(maps);
    if (select.dataset.maps !== signature) {
      select.dataset.maps = signature;
      select.replaceChildren(...maps.map(m => new Option(m.name || m.path, m.path)));
      select.value = $('car-map-file').value;
    }
    requestDraw();
  }
  // Localization quality: share of the live car LiDAR scan that falls on the
  // walls of the car map. Both come through the same car->robot transform, so
  // the value does not depend on the alignment, only on the car's AMCL pose.
  const MATCH_RADIUS_M = 0.2;
  const START_MIN_MATCH = 0.6;
  let mapGrid = null, mapGridRevision = -1, scanMatch = null;
  function updateScanMatch() {
    const mapPoints = car.map_points || [];
    const scan = car.scan_points || [];
    if (!mapPoints.length || !scan.length || !car.pose || Number(car.pose_age) > 3) {
      scanMatch = null;
      return;
    }
    if (mapGridRevision !== window.robotCarLayersRevision) {
      mapGridRevision = window.robotCarLayersRevision;
      mapGrid = new Set(mapPoints.map((p) => `${Math.round(p.x / 0.1)},${Math.round(p.y / 0.1)}`));
    }
    const reach = Math.round(MATCH_RADIUS_M / 0.1);
    let hits = 0;
    for (const p of scan) {
      const cx = Math.round(p.x / 0.1), cy = Math.round(p.y / 0.1);
      search: for (let i = -reach; i <= reach; i += 1) {
        for (let j = -reach; j <= reach; j += 1) {
          if (mapGrid.has(`${cx + i},${cy + j}`)) { hits += 1; break search; }
        }
      }
    }
    scanMatch = hits / scan.length;
  }
  const matchText = () => (scanMatch === null ? '' : ` · LiDAR match ${Math.round(scanMatch * 100)}%`);

  // Car progress line: what the car is doing and what is still missing.
  const POSE_STALE_S = 3;
  let alignInProgress = '';
  function carProgress() {
    if (!car.connected) return { text: 'Car offline · waiting for ws_bridge_v2 to connect to /ws/car', ready: false };
    const mode = car.current_mode || 'none';
    const status = car.mode_status || 'stopped';
    const age = Number(car.pose_age);
    const hasPose = car.pose && Number.isFinite(age);
    if (mode === 'mapping') {
      const cells = (car.map_points || []).length;
      return { text: `Car mapping ${status}${cells ? ` · ${cells} map cells` : ' · waiting for the first /map'}`, ready: status === 'running' && cells > 0 };
    }
    if (mode !== 'localization') {
      return { text: 'Car connected · no mode active · press Car localization (or Car mapping)', ready: false };
    }
    if (status !== 'running') return { text: `Car localization ${status}…`, ready: false };
    if (!hasPose) return { text: 'Car localization running · set Car initial pose on the map and press Load & Localize', ready: false };
    if (age > POSE_STALE_S) {
      return { text: `Car pose is stale (${Math.round(age)} s) · the car sends no data; check AMCL/TF on the car or press Load & Localize again`, ready: false };
    }
    const route = { navigating: ' · driving to the destination', paused: ' · route paused' }[carNav.state] || '';
    const poor = scanMatch !== null && scanMatch < START_MIN_MATCH;
    return {
      text: poor
        ? `Car localization is poor${matchText()} · its pose does not match the map; set the initial pose again (Load & Localize)`
        : `Car localized · X ${car.pose.x.toFixed(2)} Y ${car.pose.y.toFixed(2)} yaw ${degrees(car.pose.yaw).toFixed(0)}°${matchText()}${route}`,
      ready: !poor,
    };
  }
  function alignmentText() {
    if (alignInProgress) return `Aligning the car map to ${alignInProgress}…`;
    const alignment = car.alignment || {};
    const status = { aligned: 'Aligned', standalone: 'Not aligned (direct mode)', manual: 'Manual transform',
      failed: 'Alignment failed', waiting: 'Alignment waiting', running: 'Aligning…' }[alignment.status] || 'Not aligned';
    const message = alignment.message ? ` · ${translateRuntimeMessage(alignment.message)}` : '';
    return `${status}${message}`;
  }
  let lastProgressText = '';
  function renderCarStatus() {
    const progress = carProgress();
    const element = $('car-status');
    element.className = `route-summary${progress.ready ? ' ready' : ''}`;
    element.textContent = `${progress.text}\nAlignment: ${alignmentText()}`;
    if (progress.text !== lastProgressText && !/LiDAR match|stale \(/.test(progress.text)) log(progress.text);
    lastProgressText = progress.text;
  }


  // Car route state. The car bridge has no cancel command, so Pause sends the
  // car's current pose as its goal (its planner stops there) and Resume sends
  // the saved destination again; Stop switches the car mode off, as in the
  // standalone dashboard.
  const ARRIVAL_TOLERANCE_M = 0.35;
  const carNav = { state: 'idle', goal: null };
  window.carNavState = () => carNav.state;
  function setCarNav(state, goal = carNav.goal) {
    carNav.state = state;
    carNav.goal = goal;
    $('car-pause').disabled = state !== 'navigating';
    $('car-resume').disabled = state !== 'paused';
    window.dispatchEvent(new CustomEvent('car-nav-state', { detail: { state } }));
    renderCarStatus();
  }
  function trackCarArrival() {
    if (carNav.state !== 'navigating' || !carNav.goal || !car.pose) return;
    if (!car.connected || car.current_mode === 'none') {
      setCarNav('idle', null);
      return;
    }
    const distance = Math.hypot(car.pose.x - carNav.goal.x, car.pose.y - carNav.goal.y);
    if (distance <= ARRIVAL_TOLERANCE_M) {
      log('The car reached its destination');
      toast('The car reached its destination');
      setCarNav('idle', null);
    }
  }

  // The runtime resets the car transform to identity on the next preview,
  // goal or initial pose while an alignment is not usable (failed/waiting).
  // Poses already sent under the previous transform would then disagree with
  // the new ones, so these commands wait for an explicit choice.
  function requireUsableAlignment() {
    if (car.alignment_ready === false) {
      throw new Error('The last car alignment failed; press Align again or choose Direct mode before sending car poses');
    }
  }

  async function operation(button, fn) {
    button.disabled = true;
    window.slamButtonBusy?.(button, true);
    try {
      const result = await fn();
      if (result.success === false) throw new Error(result.error || 'Command rejected');
      say(translateRuntimeMessage(result.message || 'Request sent to the car; check its feedback.'));
      return result;
    } catch (error) {
      const message = translateRuntimeMessage(error.message);
      say(message);
      toast(message, true);
      return null;
    } finally {
      button.disabled = false;
      window.slamButtonBusy?.(button, false);
      // Pause/Resume availability follows the car route state.
      if (button.id === 'car-pause' || button.id === 'car-resume') setCarNav(carNav.state);
    }
  }
  function bind(id, fn) { $(id).addEventListener('click', event => operation(event.currentTarget, fn)); }
  const mode = name => post('/api/car/mode', {mode:name, map_file:$('car-map-file').value, slam_params_file:$('car-slam-params').value});
  bind('car-mapping', () => mode('mapping'));
  bind('car-localization', () => mode('localization'));
  // Stop also forgets the previous route: its preview, the route drawn from the
  // car's last plan and the route state, as the robot side does.
  let hiddenRoute = null;  // signature of the route removed by Stop
  window.carRouteVisible = () => Boolean(car.path?.length) && layerSignature(car.path) !== hiddenRoute;
  bind('car-stop', async () => {
    const result = await mode('stop');
    previewId = null;
    $('car-go').disabled = true;
    hiddenRoute = car.path?.length ? layerSignature(car.path) : null;
    window.robotCarLayersRevision += 1;
    setCarNav('idle', null);
    requestDraw();
    return result;
  });
  async function holdCar() {
    if (!car.pose) throw new Error('The car position is unknown');
    const hold = { x: car.pose.x, y: car.pose.y, yaw_deg: degrees(car.pose.yaw) };
    const result = await post('/api/car/goal', hold);
    setCarNav('paused');
    return result;
  }
  bind('car-pause', async () => ({ ...(await holdCar()), message: 'Car route paused' }));
  bind('car-resume', async () => {
    if (!carNav.goal) throw new Error('No paused car route');
    const { x, y, yaw_deg } = carNav.goal;
    const result = await post('/api/car/goal', { x, y, yaw_deg });
    setCarNav('navigating');
    return { ...result, message: 'Car route resumed' };
  });
  bind('car-standalone', async () => {
    $('car-tf-x').value = '0';
    $('car-tf-y').value = '0';
    $('car-tf-yaw').value = '0';
    return await post('/api/car/standalone');
  });
  // Follow car: keeps the car centered in 2D and 3D (app.js owns the follow target).
  $('car-center').addEventListener('click', () => {
    if (!car.pose) {
      toast('The car position is unknown');
      return;
    }
    window.toggleFollowTarget('car');
  });
  window.getCarPose = () => (car.connected ? car.pose : null);

  // Car map actions, matching the robot Map & Localization card. The car only
  // publishes the map it has loaded (Car localization with the selected map).
  window.carMapCleared = false;
  $('car-view-map').addEventListener('click', () => {
    const points = car.map_points || [];
    if (!points.length) {
      toast('No car map is loaded; select a map and press Car localization', true);
      return;
    }
    window.carMapCleared = false;
    window.robotCarLayersRevision += 1;
    window.dispatchEvent(new CustomEvent('robot-car-state', { detail: car }));
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const pad = 0.8;
    window.centerOnBounds?.({ minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad });
    const loaded = (car.map_file || '').split('/').pop();
    say(`Showing the car map ${loaded}`);
  });
  // Occupied cells of the published car map, in car-map coordinates, as PCD.
  $('car-download-map').addEventListener('click', () => {
    const points = car.map_points || [];
    if (!points.length) {
      toast('No car map is loaded; select a map and press Car localization', true);
      return;
    }
    const t = car.transform || { x: 0, y: 0, yaw: 0 };
    const cos = Math.cos(t.yaw), sin = Math.sin(t.yaw);
    const rows = points.map((p) => {
      const dx = p.x - t.x, dy = p.y - t.y;
      return `${(cos * dx + sin * dy).toFixed(4)} ${(-sin * dx + cos * dy).toFixed(4)} 0`;
    });
    const header = ['# .PCD v0.7 - car map occupied cells (car map frame)', 'VERSION 0.7', 'FIELDS x y z',
      'SIZE 4 4 4', 'TYPE F F F', 'COUNT 1 1 1', `WIDTH ${rows.length}`, 'HEIGHT 1',
      'VIEWPOINT 0 0 0 1 0 0 0', `POINTS ${rows.length}`, 'DATA ascii'];
    const blob = new Blob([`${header.join('\n')}\n${rows.join('\n')}\n`], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${((car.map_file || 'car_map').split('/').pop()).replace(/\.ya?ml$/, '')}_occupied.pcd`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  $('car-clear-view').addEventListener('click', () => {
    window.carMapCleared = true;
    window.robotCarLayersRevision += 1;
    window.dispatchEvent(new CustomEvent('robot-car-state', { detail: car }));
    requestDraw();
    toast('The car map was removed from the view only; it is still loaded on the car');
  });

  bind('car-transform', () => post('/api/car/transform', pose('car-tf')));
  function normalizeDegrees(deg) {
    let d = (deg + 180) % 360;
    if (d < 0) d += 360;
    return d - 180;
  }

  // Alignment uses the map the car currently publishes on /map. The car bridge
  // (ws_bridge_v2, branch yolo+car) has no 'load_map_for_stitching' command, so
  // passing car_map would make the runtime wait for a load that never comes.
  bind('car-refine-icp', async () => {
    const res = await post('/api/car/refine_icp', {...pose('car-tf'), g1_map:$('maps').value});
    if (res && res.transform) {
      $('car-tf-x').value = res.transform.x.toFixed(2);
      $('car-tf-y').value = res.transform.y.toFixed(2);
      $('car-tf-yaw').value = res.transform.yaw_deg.toFixed(1);
    }
    return res;
  });
  $('car-tf-flip')?.addEventListener('click', () => {
    const yawEl = $('car-tf-yaw');
    if (!yawEl) return;
    const flipped = normalizeDegrees((parseFloat(yawEl.value) || 0) + 180);
    yawEl.value = flipped.toFixed(1);
    toast(`TF yaw flipped by 180° → ${flipped.toFixed(1)}°`);
    requestDraw();
  });
  bind('car-align', async () => {
    alignInProgress = $('maps').value || 'the robot map';
    renderCarStatus();
    try {
      return await post('/api/car/auto_align', {g1_map:$('maps').value});
    } finally {
      alignInProgress = '';
      renderCarStatus();
    }
  });
  // The car publishes its pose only once AMCL runs (Car localization); an
  // initial pose sent in any other mode is silently ignored by the car.
  bind('car-initial-pose', async () => {
    if (car.current_mode !== 'localization') {
      throw new Error(`Start Car localization first (the car is in mode "${car.current_mode || 'none'}"); then send the pose.`);
    }
    requireUsableAlignment();
    return post('/api/car/initial_pose', pose('car-pose'));
  });
  bind('car-refresh-maps', () => post('/api/car/maps/refresh'));
  bind('car-save-map', () => post('/api/car/map/save', {map_name:$('car-map-name').value}));
  bind('car-preview', async () => {
    requireUsableAlignment();
    hiddenRoute = null;
    $('car-go').disabled = true;
    const result = await post('/api/car/path/preview', pose('car-goal'));
    previewId = result.request_id;
    return result;
  });
  $('car-go').addEventListener('click', async event => {
    if (!previewId) return;
    if (!confirm('Start the CAR on the displayed route? The robot does not receive this goal.')) return;
    const goal = pose('car-goal');
    const result = await operation(event.currentTarget, () => {
      requireUsableAlignment();
      return post('/api/car/goal', {...goal, preview_id:previewId});
    });
    if (result) setCarNav('navigating', result.map_goal ? { ...result.map_goal, yaw_deg: degrees(result.map_goal.yaw) } : goal);
    previewId = null;
    $('car-go').disabled = true;
  });
  $('car-maps').addEventListener('change', () => { $('car-map-file').value = $('car-maps').value; });
  for (const id of [
    'car-goal-x','car-goal-y','car-goal-yaw',
    'car-tf-x','car-tf-y','car-tf-yaw',
    'car-pose-x','car-pose-y','car-pose-yaw',
    'loc-x','loc-y','loc-yaw'
  ]) {
    const el = $(id);
    if (el) el.addEventListener('input', () => {
      if (id.startsWith('car-goal')) { previewId = null; $('car-go').disabled = true; }
      requestDraw();
    });
  }
  // One checkbox shows or hides both car layers (map and live scan), in 2D and 3D.
  $('car-show-map').addEventListener('change', () => {
    window.robotCarLayersRevision += 1;
    requestDraw();
    if (carMapVisible()) poll();
  });
  $('car-pick-mode')?.addEventListener('change', requestDraw);

  const PICK_CONFIG = {
    'g1-pose': { name: 'ROBOT START', color: COLORS.robot, prefix: 'loc' },
    'g1': { name: 'ROBOT DESTINATION', color: COLORS.robotDestination, prefix: 'goal', isG1Goal: true },
    'car-pose': { name: 'CAR START', color: COLORS.car, prefix: 'car-pose' },
    'car-goal': { name: 'CAR DESTINATION', color: COLORS.carDestination, prefix: 'car-goal' },
  };

  let activeDrag = null;
  const world = e => {
    const r = canvas.getBoundingClientRect();
    return projection(r.width, r.height).world(e.clientX - r.left, e.clientY - r.top);
  };

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.altKey) return;
    const mode = $('car-pick-mode').value;
    const cfg = PICK_CONFIG[mode];
    if (!cfg) return;

    e.stopImmediatePropagation();
    e.preventDefault();

    const [wx, wy] = world(e);
    const prefix = cfg.prefix;
    if ($(`${prefix}-x`)) $(`${prefix}-x`).value = wx.toFixed(2);
    if ($(`${prefix}-y`)) $(`${prefix}-y`).value = wy.toFixed(2);

    const currentYawDeg = parseFloat($(`${prefix}-yaw`)?.value) || 0;
    activeDrag = {
      mode,
      pointerId: e.pointerId,
      startX: wx,
      startY: wy,
      currentX: wx,
      currentY: wy,
      dragAngle: radians(currentYawDeg),
      dragDist: 0,
    };

    if (cfg.isG1Goal && window.setG1Goal) {
      window.setG1Goal(wx, wy, radians(currentYawDeg));
    }

    canvas.setPointerCapture(e.pointerId);
    previewId = null;
    $('car-go').disabled = true;
    requestDraw();
  }, true);

  canvas.addEventListener('pointermove', e => {
    if (!activeDrag || e.pointerId !== activeDrag.pointerId) return;
    e.stopImmediatePropagation();
    e.preventDefault();

    const [ex, ey] = world(e);
    activeDrag.currentX = ex;
    activeDrag.currentY = ey;

    const dx = ex - activeDrag.startX;
    const dy = ey - activeDrag.startY;
    activeDrag.dragDist = Math.hypot(dx, dy);

    if (activeDrag.dragDist > 0.04) {
      const angle = Math.atan2(dy, dx);
      activeDrag.dragAngle = angle;
      const cfg = PICK_CONFIG[activeDrag.mode];
      if ($(`${cfg.prefix}-yaw`)) $(`${cfg.prefix}-yaw`).value = degrees(angle).toFixed(1);
      if (cfg.isG1Goal && window.setG1Goal) {
        window.setG1Goal(activeDrag.startX, activeDrag.startY, angle);
      }
    }

    requestDraw();
  }, true);

  function endPick(e) {
    if (!activeDrag || e.pointerId !== activeDrag.pointerId) return;
    e.stopImmediatePropagation();
    e.preventDefault();

    const drag = activeDrag;
    activeDrag = null;

    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    if (e.type === 'pointercancel') {
      requestDraw();
      return;
    }

    const [ex, ey] = world(e);
    const dx = ex - drag.startX;
    const dy = ey - drag.startY;
    const cfg = PICK_CONFIG[drag.mode];
    const prefix = cfg.prefix;

    if ($(`${prefix}-x`)) $(`${prefix}-x`).value = drag.startX.toFixed(2);
    if ($(`${prefix}-y`)) $(`${prefix}-y`).value = drag.startY.toFixed(2);

    let finalYawDeg = parseFloat($(`${prefix}-yaw`)?.value) || 0;
    if (Math.hypot(dx, dy) > 0.04) {
      const angle = Math.atan2(dy, dx);
      finalYawDeg = degrees(angle);
      if ($(`${prefix}-yaw`)) $(`${prefix}-yaw`).value = finalYawDeg.toFixed(1);
      if (cfg.isG1Goal && window.setG1Goal) {
        window.setG1Goal(drag.startX, drag.startY, angle);
      }
    }

    previewId = null;
    $('car-go').disabled = true;
    requestDraw();
    const label = cfg.name.charAt(0) + cfg.name.slice(1).toLowerCase();
    toast(`${label} set: X ${drag.startX.toFixed(2)}, Y ${drag.startY.toFixed(2)}, yaw ${finalYawDeg.toFixed(1)}°`);
  }

  canvas.addEventListener('pointerup', endPick, true);
  canvas.addEventListener('pointercancel', endPick, true);

  function drawPoseMarker(ctx, px, py, yawRad, color, label, showArrow = true, arrowLen = 26) {
    ctx.save();
    // Backdrop
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.beginPath();
    ctx.arc(px, py, 8.5, 0, Math.PI * 2);
    ctx.fill();

    // Outer ring
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px - 13, py); ctx.lineTo(px - 4, py);
    ctx.moveTo(px + 4, py); ctx.lineTo(px + 13, py);
    ctx.moveTo(px, py - 13); ctx.lineTo(px, py - 4);
    ctx.moveTo(px, py + 4); ctx.lineTo(px, py + 13);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Arrow
    if (showArrow && Number.isFinite(yawRad)) {
      const endX = px + Math.cos(yawRad) * arrowLen;
      const endY = py - Math.sin(yawRad) * arrowLen;

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px, py); ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px, py); ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.save();
      ctx.translate(endX, endY);
      ctx.rotate(-yawRad);
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-7, -5);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-7, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Badge
    if (label) {
      ctx.font = 'bold 10px ui-monospace, monospace';
      const textWidth = ctx.measureText(label).width;
      const boxX = px + 12;
      const boxY = py - 18;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY - 9, textWidth + 8, 14, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(label, boxX + 4, boxY + 2);
    }
    ctx.restore();
  }

  // Static car layers; app.js caches them together with the robot map and
  // redraws them only when robotCarLayersRevision or the view changes.
  window.drawRobotCarLayers = (context, view) => {
    context.save();
    const points = (items, color, size) => {context.fillStyle=color; for(const p of items || []) {const [x,y]=view.point(p.x,p.y); context.fillRect(x-size/2,y-size/2,size,size);}};
    if (carMapVisible() && !window.carMapCleared) points(car.map_points, COLORS.carMap, 2);
    if (window.carRouteVisible()) {
      context.strokeStyle=COLORS.carRoute; context.lineWidth=2; context.setLineDash([4,4]); context.beginPath();
      car.path.forEach((p,i)=>{const [x,y]=view.point(p.x,p.y); i ? context.lineTo(x,y) : context.moveTo(x,y);}); context.stroke(); context.setLineDash([]);
    }
    context.restore();
  };

  // Car pose, pose markers and the active drag HUD, redrawn every frame.
  window.drawRobotCarOverlay = (context, view) => {
    context.save();
    if (carMapVisible() && !window.carMapCleared) {
      context.fillStyle = COLORS.carScan;
      for (const p of car.scan_points || []) {
        const [x, y] = view.point(p.x, p.y);
        context.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    if (car.pose) {
      const [x,y]=view.point(car.pose.x,car.pose.y);
      const live = car.connected && car.pose_age < 2;
      context.save(); context.translate(x,y); context.rotate(-car.pose.yaw);
      context.fillStyle=live ? COLORS.car : '#64748b'; context.fillRect(-10,-7,20,14);
      context.strokeStyle='#fff'; context.beginPath(); context.moveTo(0,0); context.lineTo(16,0); context.stroke(); context.restore();
      context.fillStyle=COLORS.car; context.fillText('CAR',x+12,y-10);
    }

    // Persistent indicators for set poses
    const curPickMode = $('car-pick-mode')?.value;
    const marker = (prefix, mode, color, label) => {
      const x = val(`${prefix}-x`), y = val(`${prefix}-y`), yaw = val(`${prefix}-yaw`);
      if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0 && curPickMode !== mode)) return;
      const [px, py] = view.point(x, y);
      drawPoseMarker(context, px, py, radians(yaw), color, label);
    };
    marker('car-goal', 'car-goal', COLORS.carDestination, 'CAR DESTINATION');
    marker('car-pose', 'car-pose', COLORS.car, 'CAR START');
    marker('loc', 'g1-pose', COLORS.robot, 'ROBOT START');

    // Active drag: anchor, live direction arrow and HUD.
    if (activeDrag) {
      const [sx, sy] = view.point(activeDrag.startX, activeDrag.startY);
      const [cx, cy] = view.point(activeDrag.currentX, activeDrag.currentY);
      const cfg = PICK_CONFIG[activeDrag.mode];
      const color = cfg.color;

      context.save();

      const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
      context.strokeStyle = color;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(sx, sy, 12 + pulse * 6, 0, Math.PI * 2);
      context.stroke();

      context.fillStyle = 'rgba(15, 23, 42, 0.82)';
      context.beginPath();
      context.arc(sx, sy, 8, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = color;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(sx, sy, 8, 0, Math.PI * 2);
      context.stroke();

      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(sx, sy, 3, 0, Math.PI * 2);
      context.fill();

      context.font = '9px ui-monospace, monospace';
      context.fillStyle = 'rgba(255, 255, 255, 0.8)';
      context.fillText(`(${activeDrag.startX.toFixed(2)}, ${activeDrag.startY.toFixed(2)})`, sx + 12, sy + 14);

      const distPx = Math.hypot(cx - sx, cy - sy);
      const angleRad = Math.atan2(-(cy - sy), cx - sx);
      const targetX = distPx >= 12 ? cx : sx + Math.cos(activeDrag.dragAngle) * 26;
      const targetY = distPx >= 12 ? cy : sy - Math.sin(activeDrag.dragAngle) * 26;
      const arrowAngle = distPx >= 12 ? angleRad : activeDrag.dragAngle;

      context.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(sx, sy);
      context.lineTo(targetX, targetY);
      context.stroke();

      context.strokeStyle = color;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(sx, sy);
      context.lineTo(targetX, targetY);
      context.stroke();

      context.save();
      context.translate(targetX, targetY);
      context.rotate(-arrowAngle);
      context.fillStyle = color;
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(12, 0);
      context.lineTo(-10, -7);
      context.lineTo(-6, 0);
      context.lineTo(-10, 7);
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();

      const hudText = `${cfg.name} · ${degrees(arrowAngle).toFixed(1)}°`;
      const distText = `Distance: ${activeDrag.dragDist.toFixed(2)} m`;
      context.font = 'bold 11px system-ui, -apple-system, sans-serif';
      const line1W = context.measureText(hudText).width;
      context.font = '10px ui-monospace, monospace';
      const line2W = context.measureText(distText).width;
      const boxW = Math.max(line1W, line2W) + 16;
      const hudX = targetX + 16;
      const hudY = targetY - 38;

      context.fillStyle = 'rgba(15, 23, 42, 0.92)';
      context.strokeStyle = color;
      context.lineWidth = 1.5;
      context.beginPath();
      context.roundRect(hudX, hudY, boxW, 34, 6);
      context.fill();
      context.stroke();

      context.fillStyle = color;
      context.font = 'bold 11px system-ui, -apple-system, sans-serif';
      context.fillText(hudText, hudX + 8, hudY + 14);

      context.fillStyle = '#94a3b8';
      context.font = '10px ui-monospace, monospace';
      context.fillText(distText, hudX + 8, hudY + 28);

      context.restore();
    }

    context.restore();
  };

  // Runtime event stream (runtime_events.js), handled exactly like the
  // standalone dashboard's WebSocket: car_state carries the pose and the
  // map/scan/path layers, car_path_status enables Start for the previewed route.
  window.addEventListener('runtime-car-message', (event) => {
    const msg = event.detail || {};
    if (msg.type === 'car_state') update(msg);
    else if (msg.type === 'car_mode_status') update({current_mode: msg.current_mode, mode_status: msg.mode_status});
    else if (msg.type === 'car_maps_list') update({available_maps: msg.maps});
    else if (msg.type === 'car_path_status') {
      say(translateRuntimeMessage(msg.error || `Car planner: ${msg.status} · ${msg.points || 0} points`));
      if (msg.request_id === previewId) $('car-go').disabled = msg.status !== 'ready' || !msg.points;
    } else if (msg.type === 'car_save_map_status' || msg.type === 'car_initial_pose_status') {
      say(translateRuntimeMessage(msg.error || msg.message || JSON.stringify(msg)));
    }
  });

  // The car state is also polled once per second, as in the standalone
  // dashboard. While the event stream is connected it delivers the layers, so
  // the poll omits them; without it the layers (~200 kB, serialized on the
  // runtime event loop) are polled every other second, only while the car is
  // connected and its layer is shown, and never while teleop is armed (teleop
  // requires commands to reach the runtime within 0.4 s).
  async function poll() {
    if (polling || !window.slamViewVisible()) return;
    polling = true;
    pollCount += 1;
    try {
      const layers = !window.slamRuntimeEventsConnected && Boolean(car.connected)
        && carMapVisible() && !window.slamTeleopArmed() && pollCount % 2 === 0;
      update(await api(`/api/car/status?include_layers=${layers}`));
    } catch (error) {
      $('car-status').textContent = translateRuntimeMessage(error.message);
    } finally {
      polling = false;
    }
  }
  poll();
  setInterval(poll, 1000);
})();
