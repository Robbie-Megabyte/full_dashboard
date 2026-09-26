"use strict";
// Vizualizare 3D, sincronizată strâns cu harta 2D — ambele sunt afișate
// simultan (panouri separate), arată exact aceleași date, actualizate din
// aceleași surse. Interacțiunea (click pentru destinație, drag pentru
// orientare, TF mașinuță etc.) rămâne exclusiv pe harta 2D (#map),
// neschimbată — acest fișier doar citește ce a fost deja setat acolo
// (poziție, țintă, rută, transformare mașinuță) și desenează același lucru
// în 3D, plus norul complet 3D al hărții curente (din /api/map/points sau
// /api/maps/{nume}/points, deja disponibile în backend).
(() => {
  const canvas3d = document.getElementById("map3d");
  if (!canvas3d || typeof THREE === "undefined") return;

  let renderer, scene, camera, controls, referenceGrid;
  let pointsMesh, carPointsMesh, robotGroup, robotFallbackMesh, goalMarker, goalArrow, carMarker, carFallbackMesh, routeLine, carRouteLine, semanticChairGroup;
  let sceneReady = false;
  const COLORS = window.SLAM_LAYER_COLORS;
  const hex = (color) => new THREE.Color(color).getHex();
  let robotRing, carGoalMarker, carGoalArrow, carScanMesh;
  let carState = {};
  let floorOffset = 0; // ridică norul hărții G1 ca podeaua reală să cadă la y=0

  function worldToThree(x, y) { return { x: Number(x) || 0, z: -(Number(y) || 0) }; }
  function yawToThreeRotation(yaw) { return (Number(yaw) || 0) - Math.PI / 2; }

  // ── Modelul 3D al G1, portat identic din dashboard_g1_test_v2 ────────────
  function makeSolidRobotMaterial(options) {
    return new THREE.MeshStandardMaterial({
      ...options, transparent: false, opacity: 1,
      side: THREE.DoubleSide, depthTest: true, depthWrite: true,
    });
  }

  function buildFallbackG1() {
    const group = new THREE.Group();
    const light = makeSolidRobotMaterial({ color: 0xcbd5e1, roughness: 0.55, metalness: 0.2 });
    const dark = makeSolidRobotMaterial({ color: 0x1f2937, roughness: 0.65, metalness: 0.15 });
    const part = (geometry, material, position, rotation = [0, 0, 0]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      group.add(mesh);
    };
    part(new THREE.BoxGeometry(0.34, 0.22, 0.22), dark, [0, 0.72, 0]);
    part(new THREE.BoxGeometry(0.43, 0.43, 0.22), light, [0, 1.01, 0]);
    part(new THREE.SphereGeometry(0.16, 16, 12), dark, [0, 1.34, -0.01]);
    [-0.12, 0.12].forEach((x) => {
      part(new THREE.CapsuleGeometry(0.065, 0.31, 6, 10), light, [x, 0.43, 0]);
      part(new THREE.CapsuleGeometry(0.055, 0.30, 6, 10), dark, [x, 0.13, -0.015]);
      part(new THREE.BoxGeometry(0.13, 0.06, 0.25), dark, [x, 0.015, -0.07]);
    });
    [-0.29, 0.29].forEach((x) => {
      part(new THREE.CapsuleGeometry(0.05, 0.29, 6, 10), light, [x, 0.93, 0], [0, 0, x < 0 ? -0.12 : 0.12]);
      part(new THREE.CapsuleGeometry(0.045, 0.27, 6, 10), dark, [x * 1.08, 0.65, 0]);
    });
    return group;
  }

  function parseBinarySTL(buffer) {
    const view = new DataView(buffer);
    if (buffer.byteLength < 84) throw new Error("STL incomplet");
    const count = view.getUint32(80, true);
    if (buffer.byteLength < 84 + count * 50) throw new Error("STL binar invalid");
    const positions = new Float32Array(count * 9);
    const normals = new Float32Array(count * 9);
    let offset = 84;
    for (let triangle = 0; triangle < count; triangle += 1, offset += 50) {
      const nx = view.getFloat32(offset, true);
      const ny = view.getFloat32(offset + 4, true);
      const nz = view.getFloat32(offset + 8, true);
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const source = offset + 12 + vertex * 12;
        const target = triangle * 9 + vertex * 3;
        positions[target] = view.getFloat32(source, true);
        positions[target + 1] = view.getFloat32(source + 4, true);
        positions[target + 2] = view.getFloat32(source + 8, true);
        normals[target] = nx; normals[target + 1] = ny; normals[target + 2] = nz;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }

  async function loadG1RobotModel() {
    const definitions = [
      ["./assets/g1/g1_light.stl", makeSolidRobotMaterial({ color: 0xbfc7ce, roughness: 0.48, metalness: 0.28 })],
      ["./assets/g1/g1_dark.stl", makeSolidRobotMaterial({ color: 0x20262d, roughness: 0.62, metalness: 0.18 })],
    ];
    const meshes = await Promise.all(definitions.map(async ([url, material]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return new THREE.Mesh(parseBinarySTL(await response.arrayBuffer()), material);
    }));
    const model = new THREE.Group();
    meshes.forEach((mesh) => model.add(mesh));
    robotGroup.add(model);
    if (robotFallbackMesh) robotFallbackMesh.visible = false;
  }

  function loadThreeAsset(loader, url) {
    return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
  }

  async function loadCarModel() {
    if (typeof THREE.OBJLoader !== "function") throw new Error("OBJLoader indisponibil");
    const assetRoot = "./assets/car/model_masina";
    const [model, texture] = await Promise.all([
      loadThreeAsset(new THREE.OBJLoader(), `${assetRoot}/3DModel.obj`),
      loadThreeAsset(new THREE.TextureLoader(), `${assetRoot}/3DModel.jpg`),
    ]);
    if ("colorSpace" in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const material = new THREE.MeshStandardMaterial({
      map: texture, color: 0xffffff, roughness: 0.72, metalness: 0.04,
      side: THREE.DoubleSide,
    });
    let meshCount = 0;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.material = material;
      child.frustumCulled = true;
      meshCount += 1;
    });
    if (!meshCount) throw new Error("The OBJ model contains no mesh");

    model.updateMatrixWorld(true);
    let bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const horizontalSize = Math.max(size.x, size.z);
    if (!Number.isFinite(horizontalSize) || horizontalSize <= 0) throw new Error("Dimensiuni OBJ invalide");
    model.scale.setScalar(0.75 / horizontalSize);
    model.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -bounds.min.y, -center.z);

    carMarker.add(model);
    carFallbackMesh.visible = false;
  }

  function initScene() {
    if (sceneReady) return true;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
    } catch (error) {
      if (typeof toast === "function") toast(`The 3D view could not start: ${error.message}`, true);
      return false;
    }
    sceneReady = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x171817);
    camera = new THREE.PerspectiveCamera(55, 1, 0.05, 500);
    camera.position.set(0, 9, 11);
    controls = new THREE.OrbitControls(camera, canvas3d);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.495;

    referenceGrid = new THREE.GridHelper(60, 60, 0x303230, 0x232523);
    referenceGrid.visible = false;
    scene.add(referenceGrid);
    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 0.55);
    sun.position.set(6, 12, 4);
    scene.add(sun);

    pointsMesh = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ size: 0.045, vertexColors: true, sizeAttenuation: true })
    );
    scene.add(pointsMesh);

    carPointsMesh = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: hex(COLORS.carMap), size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.8 })
    );
    scene.add(carPointsMesh);

    carScanMesh = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: hex(COLORS.carScan), size: 0.06, sizeAttenuation: true })
    );
    scene.add(carScanMesh);

    semanticChairGroup = new THREE.Group();
    scene.add(semanticChairGroup);

    robotGroup = new THREE.Group();
    robotFallbackMesh = buildFallbackG1();
    robotGroup.add(robotFallbackMesh);
    const headingArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.95, 0), 1.0, hex(COLORS.robot), 0.28, 0.18
    );
    robotGroup.add(headingArrow);
    // Ground ring in the legend's robot color, around the G1 model.
    robotRing = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.42, 36),
      new THREE.MeshBasicMaterial({ color: hex(COLORS.robot), side: THREE.DoubleSide })
    );
    robotRing.rotation.x = -Math.PI / 2;
    robotRing.position.y = 0.015;
    robotGroup.add(robotRing);
    robotGroup.visible = false;
    scene.add(robotGroup);
    loadG1RobotModel().catch(() => {
      // The procedural fallback stays visible if the official STL meshes fail to load.
    });

    goalMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.22, 28),
      new THREE.MeshBasicMaterial({ color: hex(COLORS.robotDestination), side: THREE.DoubleSide })
    );
    goalMarker.rotation.x = -Math.PI / 2;
    goalMarker.visible = false;
    scene.add(goalMarker);

    goalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.05, 0), 0.7, hex(COLORS.robotDestination), 0.2, 0.13
    );
    goalArrow.visible = false;
    scene.add(goalArrow);

    carGoalMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.19, 28),
      new THREE.MeshBasicMaterial({ color: hex(COLORS.carDestination), side: THREE.DoubleSide })
    );
    carGoalMarker.rotation.x = -Math.PI / 2;
    carGoalMarker.visible = false;
    scene.add(carGoalMarker);

    carGoalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.05, 0), 0.55, hex(COLORS.carDestination), 0.18, 0.12
    );
    carGoalArrow.visible = false;
    scene.add(carGoalArrow);

    carMarker = new THREE.Group();
    carFallbackMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.14, 0.48),
      new THREE.MeshBasicMaterial({ color: hex(COLORS.car) })
    );
    carFallbackMesh.position.y = 0.07;
    carMarker.add(carFallbackMesh);
    carMarker.visible = false;
    scene.add(carMarker);
    loadCarModel().catch((error) => {
      console.warn("The car 3D model did not load; using the fallback box.", error);
    });

    routeLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: hex(COLORS.robotRoute), linewidth: 6 })
    );
    routeLine.visible = false;
    scene.add(routeLine);

    carRouteLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: hex(COLORS.carRoute) })
    );
    carRouteLine.visible = false;
    scene.add(carRouteLine);

    window.addEventListener("resize", resizeRenderer);
    resizeRenderer();
    requestAnimationFrame(animate);
    return true;
  }

  function resizeRenderer() {
    if (!renderer) return;
    const rect = canvas3d.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  // Follow robot / Follow car: pan the camera and its orbit target together so
  // the followed pose stays centered with the current viewing angle.
  function followCamera() {
    const pose = window.getFollowTargetPose?.();
    if (!pose) return false;
    const flat = worldToThree(pose.x, pose.y);
    const dx = flat.x - controls.target.x;
    const dz = flat.z - controls.target.z;
    if (Math.abs(dx) + Math.abs(dz) < 1e-3) return false;
    controls.target.x += dx;
    controls.target.z += dz;
    camera.position.x += dx;
    camera.position.z += dz;
    return true;
  }

  // Renders only while the 3D pane is visible: every frame while the camera
  // moves, otherwise at 10 Hz for pose/route markers.
  let lastRender = 0;
  function animate(now) {
    requestAnimationFrame(animate);
    if (!renderer || !window.slamViewVisible() || pane3d?.classList.contains("pane-hidden")) return;
    const followed = followCamera();
    const moved = controls.update() || followed;
    if (!moved && now - lastRender < 100) return;
    lastRender = now;
    if (referenceGrid) {
      referenceGrid.visible =
        typeof backendOnline !== "undefined" && Boolean(backendOnline);
    }
    updateLiveMarkers();
    renderer.render(scene, camera);
  }

  // Robot map in the legend color, brighter with height for depth perception.
  const robotMapRgb = new THREE.Color(COLORS.robotMap);
  function heightColor(z) {
    const t = Math.max(0, Math.min(1, (Number(z) + 0.3) / 2.2));
    const shade = 0.5 + 0.5 * t;
    return [robotMapRgb.r * shade, robotMapRgb.g * shade, robotMapRgb.b * shade];
  }

  // Norul brut are Z relativ la originea senzorului (LiDAR-ul e sus, pe cap),
  // nu la podea. Al 5-lea percentil e o estimare robustă a podelei (ignoră
  // câțiva outlieri joși), pe care o aducem la y=0, unde stau și robotul și
  // grila de referință.
  function estimateFloorOffset(points) {
    if (!points.length) return 0;
    const heights = points.map((p) => Number(p[2]) || 0).sort((a, b) => a - b);
    const floor = heights[Math.floor(heights.length * 0.05)];
    return -floor;
  }

  function fillGeometry(mesh, points, colorFn, heightOffset = 0) {
    const count = points.length;
    const positions = new Float32Array(count * 3);
    const colors = colorFn ? new Float32Array(count * 3) : null;
    for (let i = 0; i < count; i += 1) {
      const p = points[i];
      const flat = worldToThree(p[0], p[1]);
      const height = (Number(p[2]) || 0) + heightOffset;
      positions[i * 3] = flat.x;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = flat.z;
      if (colorFn) {
        const c = colorFn(height);
        colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
      }
    }
    mesh.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    if (colorFn) geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    mesh.geometry = geometry;
  }

  function setLine(line, points2d, y) {
    if (line.userData.points === points2d) return;
    line.userData.points = points2d;
    if (!points2d || points2d.length < 2) { line.visible = false; return; }
    const positions = new Float32Array(points2d.length * 3);
    points2d.forEach((p, i) => {
      const flat = worldToThree(Number(p[0]), Number(p[1]));
      positions[i * 3] = flat.x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = flat.z;
    });
    line.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    line.geometry = geometry;
    line.visible = true;
  }

  // The 3D robot map follows the same source as the 2D view (app.js
  // 'robot-map-source'): a saved map or partial capture is loaded once, the
  // live mapping cloud is reloaded only when its revision changes, and a
  // cleared view stays empty.
  let loadedSourceKey = null;
  let loadedLiveRevision = -1;
  function sourceKey(source) {
    return source.kind === "saved" ? `saved:${source.name}`
      : source.kind === "partial" ? `partial:${source.session}/${source.snapshot}`
      : source.kind;
  }
  async function loadMapPoints() {
    const source = window.robotMapSource || { kind: "live" };
    const key = sourceKey(source);
    if (source.kind === "none") {
      if (loadedSourceKey !== key) fillGeometry(pointsMesh, [], heightColor, 0);
      loadedSourceKey = key;
      return;
    }
    const liveRevision = typeof state !== "undefined" && state ? state.map_revision : -1;
    if (key === loadedSourceKey && (source.kind !== "live" || liveRevision === loadedLiveRevision)) return;
    if (!window.slamViewVisible() || pane3d?.classList.contains("pane-hidden")) return;
    if (source.kind === "live" && window.slamTeleopArmed()) return;
    try {
      const data = source.kind === "saved"
        ? await api(`/api/maps/${encodeURIComponent(source.name)}/points?limit=100000`)
        : source.kind === "partial"
          ? await api(`/api/partial-maps/${encodeURIComponent(source.session)}/${encodeURIComponent(source.snapshot)}/points?limit=100000`)
          : await api("/api/map/points?limit=45000");
      if (sourceKey(window.robotMapSource || { kind: "live" }) !== key) return;
      const points = data.points || [];
      floorOffset = estimateFloorOffset(points);
      fillGeometry(pointsMesh, points, heightColor, floorOffset);
      loadedSourceKey = key;
      loadedLiveRevision = liveRevision;
    } catch (_error) {
      // View only: a failure here must not affect the 2D controls.
    }
  }

  // car.js polls the car state once and shares it through 'robot-car-state'.
  let carLayersRevision = -1;
  // The car map is rebuilt only when its layer revision changes; the live scan
  // whenever a new scan array arrives.
  let carScanSource = null;
  function applyCarState(nextState) {
    carState = nextState || {};
    const visible = document.getElementById("car-show-map").checked && !window.carMapCleared;
    if (window.robotCarLayersRevision !== carLayersRevision) {
      carLayersRevision = window.robotCarLayersRevision;
      const mapPoints = (carState.map_points || []).map((p) => [p.x, p.y, 0]);
      fillGeometry(carPointsMesh, mapPoints, null);
      carPointsMesh.visible = visible && mapPoints.length > 0;
    }
    if (carState.scan_points !== carScanSource) {
      carScanSource = carState.scan_points;
      fillGeometry(carScanMesh, (carScanSource || []).map((p) => [p.x, p.y, 0.02]), null);
    }
    carScanMesh.visible = visible && (carScanSource || []).length > 0;
  }

  function updateLiveMarkers() {
    if (typeof state !== "undefined" && state && state.pose) {
      const flat = worldToThree(state.pose.x, state.pose.y);
      robotGroup.position.set(flat.x, 0, flat.z);
      robotGroup.rotation.y = yawToThreeRotation(state.pose.yaw);
      robotGroup.visible = true;
    } else {
      robotGroup.visible = false;
    }

    const goal = typeof window.getG1Goal === "function" ? window.getG1Goal() : null;
    if (goal) {
      const flat = worldToThree(goal.x, goal.y);
      goalMarker.position.set(flat.x, 0.02, flat.z);
      goalMarker.visible = true;
      goalArrow.position.set(flat.x, 0.05, flat.z);
      goalArrow.setDirection(new THREE.Vector3(Math.cos(goal.yaw), 0, -Math.sin(goal.yaw)));
      goalArrow.visible = true;
    } else {
      goalMarker.visible = false;
      goalArrow.visible = false;
    }

    const preview = typeof routePreview !== "undefined" ? routePreview : null;
    setLine(routeLine, preview ? preview.points : null, 0.05);

    const carGoalX = Number(document.getElementById("car-goal-x")?.value);
    const carGoalY = Number(document.getElementById("car-goal-y")?.value);
    const carGoalYaw = Number(document.getElementById("car-goal-yaw")?.value) * Math.PI / 180;
    const carGoalSet = Number.isFinite(carGoalX) && Number.isFinite(carGoalY) && (carGoalX !== 0 || carGoalY !== 0);
    if (carGoalSet) {
      const flat = worldToThree(carGoalX, carGoalY);
      carGoalMarker.position.set(flat.x, 0.02, flat.z);
      carGoalArrow.position.set(flat.x, 0.05, flat.z);
      carGoalArrow.setDirection(new THREE.Vector3(Math.cos(carGoalYaw), 0, -Math.sin(carGoalYaw)));
    }
    carGoalMarker.visible = carGoalSet;
    carGoalArrow.visible = carGoalSet;

    if (carState && carState.pose && carState.connected) {
      const flat = worldToThree(carState.pose.x, carState.pose.y);
      carMarker.position.set(flat.x, 0.02, flat.z);
      carMarker.rotation.y = yawToThreeRotation(carState.pose.yaw);
      carMarker.visible = true;
    } else {
      carMarker.visible = false;
    }
    const carRoute = window.carRouteVisible?.() ? carState.path : null;
    if (carRouteLine.userData.source !== carRoute) {
      carRouteLine.userData.source = carRoute;
      setLine(carRouteLine, (carRoute || []).map((p) => [p.x, p.y]), 0.06);
    }
  }



  function semanticAgingColor(agingValue, agingCap) {
    const ratio = Math.max(0, Math.min(1, agingValue / Math.max(0.1, agingCap)));
    return ratio > 0.50 ? "#c084fc" : ratio > 0.25 ? "#f59e0b" : "#ef4444";
  }

  function semanticLabelSprite(text, agingValue = 0, agingCap = 100, lidarSupported = false) {
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 512;
    labelCanvas.height = 96;
    const context = labelCanvas.getContext("2d");
    const value = Math.max(0, Number(agingValue) || 0);
    const cap = Math.max(1, Number(agingCap) || 100);
    const ratio = Math.max(0, Math.min(1, value / cap));
    const color = semanticAgingColor(value, cap);
    context.fillStyle = "rgba(15,5,30,.94)";
    context.strokeStyle = color;
    context.lineWidth = 5;
    context.fillRect(4, 4, 504, 88);
    context.strokeRect(4, 4, 504, 88);
    context.fillStyle = "#fff";
    context.font = "bold 30px Inter, sans-serif";
    context.textBaseline = "middle";
    context.fillText(text, 18, 34);
    context.fillStyle = color;
    context.font = "bold 24px ui-monospace, monospace";
    context.textAlign = "right";
    context.fillText(`AGING ${value.toFixed(0)}/${cap.toFixed(0)}`, 494, 34);
    context.fillStyle = "rgba(255,255,255,.16)";
    context.fillRect(18, 70, 476, 14);
    context.fillStyle = color;
    context.fillRect(18, 70, 476 * ratio, 14);
    context.fillStyle = lidarSupported ? "#22d3ee" : "#94a3b8";
    context.font = "bold 15px Inter, sans-serif";
    context.fillText(lidarSupported ? "LiDAR ✓" : "YOLO/camera", 492, 59);
    const texture = new THREE.CanvasTexture(labelCanvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(1.55, 0.29, 1);
    sprite.renderOrder = 20;
    return sprite;
  }

  function clearSemanticChairScene() {
    if (!semanticChairGroup) return;
    semanticChairGroup.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    });
    semanticChairGroup.clear();
  }

  function renderSemanticChairs(message) {
    if (!sceneReady || !semanticChairGroup) return;
    clearSemanticChairScene();
    if (!message?.calibration_available) return;
    const objects = Array.isArray(message.objects) ? message.objects : [];
    const defaultCap = Math.max(1, Number(message.aging_cap) || 100);
    objects.forEach((object) => {
      const points = Array.isArray(object.points) ? object.points : [];
      if (points.length) {
        const positions = new Float32Array(points.length * 3);
        const colors = new Float32Array(points.length * 3);
        points.forEach((point, index) => {
          const flat = worldToThree(point.x, point.y);
          positions[index * 3] = flat.x;
          positions[index * 3 + 1] = Number(point.z) || 0;
          positions[index * 3 + 2] = flat.z;
          colors[index * 3] = Number(point.r ?? 180) / 255;
          colors[index * 3 + 1] = Number(point.g ?? 180) / 255;
          colors[index * 3 + 2] = Number(point.b ?? 180) / 255;
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        semanticChairGroup.add(new THREE.Points(geometry, new THREE.PointsMaterial({
          size: 0.028, vertexColors: true, sizeAttenuation: true,
          transparent: true, opacity: 0.9,
        })));
      }
      const minimum = object.bounds?.min;
      const maximum = object.bounds?.max;
      if (!minimum || !maximum) return;
      const sizeX = Math.max(0.08, Number(maximum.x) - Number(minimum.x));
      const sizeY = Math.max(0.08, Number(maximum.y) - Number(minimum.y));
      const sizeZ = Math.max(0.08, Number(maximum.z) - Number(minimum.z));
      const center = worldToThree(
        (Number(minimum.x) + Number(maximum.x)) / 2,
        (Number(minimum.y) + Number(maximum.y)) / 2,
      );
      const centerZ = (Number(minimum.z) + Number(maximum.z)) / 2;
      const aging = Math.max(0, Number(object.aging_value) || 0);
      const cap = Math.max(1, Number(object.aging_cap) || defaultCap);
      const boxGeometry = new THREE.BoxGeometry(sizeX, sizeZ, sizeY);
      const volume = new THREE.Mesh(boxGeometry, new THREE.MeshBasicMaterial({
        color: 0xa855f7, transparent: true, opacity: 0.06,
        depthWrite: false, side: THREE.DoubleSide,
      }));
      volume.position.set(center.x, centerZ, center.z);
      semanticChairGroup.add(volume);
      const edgesSource = boxGeometry.clone();
      const edgesGeometry = new THREE.EdgesGeometry(edgesSource);
      edgesSource.dispose();
      const box = new THREE.LineSegments(
        edgesGeometry,
        new THREE.LineBasicMaterial({ color: semanticAgingColor(aging, cap) }),
      );
      box.position.copy(volume.position);
      semanticChairGroup.add(box);
      const label = semanticLabelSprite(
        object.name || `chair ${object.id}`, aging, cap, Boolean(object.lidar_supported),
      );
      label.position.set(center.x, Number(maximum.z) + 0.18, center.z);
      semanticChairGroup.add(label);
    });
  }


  function refreshAll() {
    loadMapPoints();
  }

  window.addEventListener("robot-map-source", refreshAll);
  window.addEventListener("robot-map-visibility", (event) => {
    if (pointsMesh) pointsMesh.visible = Boolean(event.detail?.visible);
  });

  window.addEventListener("semantic-chairs", (event) => renderSemanticChairs(event.detail));
  window.addEventListener("robot-car-state", (event) => {
    if (sceneReady) applyCarState(event.detail);
  });
  window.renderSemanticChairs = renderSemanticChairs;


  // ── Comutare panouri: 3D, 2D sau ambele — doar afișare, controlul rămâne
  // mereu pe #map (2D), indiferent care panou e vizibil în acel moment.
  const pane3d = document.querySelector(".viewer-pane-3d");
  const pane2d = document.querySelector(".viewer-pane-2d");
  const modeButtons = document.querySelectorAll("[data-view-mode]");
  let requestedViewMode = "3d";

  function setViewMode(mode) {
    requestedViewMode = mode;
    const offline =
      document.documentElement.classList.contains("fd21-backend-offline");

    if (pane3d) {
      pane3d.classList.toggle(
        "pane-hidden",
        offline || mode === "2d"
      );
    }
    if (pane2d) {
      pane2d.classList.toggle(
        "pane-hidden",
        !offline && mode === "3d"
      );
    }

    modeButtons.forEach((button) => {
      const isActive = button.dataset.viewMode === mode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (!offline && mode !== "2d") {
      requestAnimationFrame(resizeRenderer);
      if (sceneReady) loadMapPoints();
    }
    if ((offline || mode !== "3d") && typeof requestDraw === "function") {
      requestAnimationFrame(requestDraw);
    }
  }
  modeButtons.forEach((button) => {
    button.addEventListener("click", () => setViewMode(button.dataset.viewMode));
  });

  /* Both is the deterministic default. This prevents a first-load state where
     the 2D pane collapses until the user leaves and re-enters the SLAM tab. */
  setViewMode("3d");

  const repairVisibleLayout = () => {
    if (document.hidden) return;
    requestAnimationFrame(() => {
      resizeRenderer();
      if (typeof requestDraw === "function") requestDraw();
    });
  };
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(repairVisibleLayout);
    if (pane3d) observer.observe(pane3d);
    if (pane2d) observer.observe(pane2d);
  }
  window.addEventListener("pageshow", repairVisibleLayout, { passive: true });
  window.addEventListener("resize", repairVisibleLayout, { passive: true });
  document.addEventListener("visibilitychange", repairVisibleLayout);

  const rootClassObserver = new MutationObserver(() => {
    setViewMode(requestedViewMode);
  });
  rootClassObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  if (initScene()) {
    if (window.latestSemanticChairMessage) renderSemanticChairs(window.latestSemanticChairMessage);
    refreshAll();
    setInterval(loadMapPoints, 3000);
  }
})();
