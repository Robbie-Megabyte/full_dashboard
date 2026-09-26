(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const PANEL_KEYS = ["robot", "map", "car"];
  const PANEL_STORE = "full_dashboard_slam_major_order_v18_2";
  const WIDTH_STORE = "full_dashboard_slam_major_widths_v18_3";
  const FLIP_MS = 290;
  const FLIP_EASING = "cubic-bezier(0.2, 0.85, 0.25, 1)";
  let requestedWidths = null;
  let dragOwner = null;
  let resizeOwner = null;
  let resizeState = null;
  let resizeFrame = null;
  let queuedResize = null;
  let panelWidthObserver = null;
  let buttonStyleGuardInstalled = false;
  let buttonStyleRepairQueued = false;
  let presentationGuardInstalled = false;
  let presentationRepairQueued = false;
  let lateOwnerGuardInstalled = false;
  let lateRepairQueued = false;
  let dropdownEventsInstalled = false;
  const dropdownStates = new Map();

  function setFirstBarColor() {
    const left = document.querySelector(
      ".app-shell > .control-panel:not(.car-side)"
    );
    if (!left) return;
    const color = getComputedStyle(left).backgroundColor;
    if (color && color !== "rgba(0, 0, 0, 0)") {
      document.documentElement.style.setProperty("--fd18-left-sidebar-bg", color);
    }
  }

  function normalizeFinalPresentation() {
    const topbar = document.querySelector(".workspace > .topbar");
    topbar?.style.removeProperty("background");
    topbar?.style.removeProperty("background-color");

    const progress = document.querySelector(".mapping-progress");
    if (progress) {
      const rowProps = [
        "display", "align-items", "justify-content", "gap",
        "grid-template-columns", "min-height", "height", "width",
        "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
        "margin", "margin-top", "margin-right", "margin-bottom", "margin-left"
      ];
      const typeProps = [
        "font", "font-family", "font-size", "font-weight", "font-style",
        "line-height", "letter-spacing", "text-transform", "color",
        "opacity", "text-shadow", "min-width", "width", "justify-self", "text-align"
      ];
      for (const row of progress.children) {
        for (const prop of rowProps) row.style.removeProperty(prop);
        for (const node of row.querySelectorAll("span,b,strong")) {
          for (const prop of typeProps) node.style.removeProperty(prop);
        }
      }
    }
  }

  function installPresentationGuard() {
    normalizeFinalPresentation();
    if (presentationGuardInstalled) return;
    presentationGuardInstalled = true;
    const observer = new MutationObserver(() => {
      if (presentationRepairQueued) return;
      presentationRepairQueued = true;
      requestAnimationFrame(() => {
        normalizeFinalPresentation();
        presentationRepairQueued = false;
      });
    });
    const topbar = document.querySelector(".workspace > .topbar");
    const progress = document.querySelector(".mapping-progress");
    if (topbar) observer.observe(topbar, { attributes: true, attributeFilter: ["style"] });
    if (progress) observer.observe(progress, {
      attributes: true, attributeFilter: ["style"], childList: true, subtree: true
    });
  }

  function removeLegacyDropdowns(scope = document) {
    scope.querySelectorAll(
      ".fd-partial-dropdown-v6,.fd-map-dropdown-v7,.fd16-dropdown,"
      + ".fd162-dropdown,.fd163-dropdown,.fd164-dropdown,"
      + ".fd166-select-shell,.fd17-health-dropdown,.fd13-select-menu,"
      + "[class*='fd-car-pick-dropdown']"
    ).forEach(node => node.remove());
    document.querySelectorAll(
      "body > .fd-partial-menu-v6,body > .fd-map-menu-v7,"
      + "body > .fd162-dropdown-menu,body > .fd163-dropdown-menu,"
      + "body > .fd164-dropdown-menu,body > .fd17-health-menu"
    ).forEach(node => node.remove());
  }

  function optionText(select, option, fallback) {
    const text = String(option?.textContent || "").trim().replace(/…+$/, "").trim();
    if (select.id === "car-pick-mode" && text === "G1 destination (v3)") {
      return "G1 destination";
    }
    return text || fallback;
  }

  function closeDropdowns(except = null) {
    for (const [id, state] of dropdownStates) {
      if (id === except) continue;
      state.root.classList.remove("open");
      state.trigger.setAttribute("aria-expanded", "false");
      state.menu.hidden = true;
    }
  }

  function selectedTriggerWidth(state) {
    if (!state.top) return;
    const context = document.createElement("canvas").getContext("2d");
    context.font = '650 12px "Plus Jakarta Sans", system-ui, sans-serif';
    const textWidth = context.measureText(state.label.textContent).width;
    const width = Math.max(128, Math.min(280, Math.ceil(textWidth + 50)));
    state.root.style.setProperty("width", `${width}px`, "important");
    state.root.style.setProperty("min-width", `${width}px`, "important");
    state.trigger.style.setProperty("width", `${width}px`, "important");
    state.trigger.style.setProperty("min-width", `${width}px`, "important");
  }

  function positionDropdown(state) {
    if (state.menu.hidden) return;
    const rect = state.trigger.getBoundingClientRect();
    state.menu.style.left = `${Math.round(rect.left)}px`;
    state.menu.style.top = `${Math.round(rect.bottom + 4)}px`;
    state.menu.style.width = `${Math.round(rect.width)}px`;
  }

  function syncDropdown(state) {
    const { select, fallback, label, menu } = state;
    const chosen = select.options[select.selectedIndex];
    label.textContent = optionText(select, chosen, fallback);
    state.trigger.disabled = select.disabled;
    selectedTriggerWidth(state);

    menu.replaceChildren();
    for (const option of select.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "fd18-dropdown-option";
      button.setAttribute("role", "option");
      button.dataset.value = option.value;
      button.textContent = optionText(select, option, fallback);
      if (option.value === select.value) {
        button.classList.add("selected");
        button.setAttribute("aria-selected", "true");
      }
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncDropdown(state);
        closeDropdowns();
      });
      menu.append(button);
    }
  }

  function ensureCompositeDropdown(select, fallback, top = false) {
    if (!select) return null;
    if (!select.options.length) select.add(new Option(fallback, ""));
    select.classList.remove(
      "fd162-native-select", "fd17-native-select", "fd166-car-pick-source-hidden",
      "fd18-composite-select"
    );
    select.classList.add("fd18-native-select");

    let state = dropdownStates.get(select.id);
    if (!state) {
      const root = document.createElement("div");
      root.className = "fd18-dropdown" + (top ? " fd18-dropdown-top" : "");

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "fd18-dropdown-trigger";
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");

      const label = document.createElement("span");
      label.className = "fd18-dropdown-label";
      const chevron = document.createElement("span");
      chevron.className = "fd18-dropdown-chevron";
      chevron.setAttribute("aria-hidden", "true");
      trigger.append(label, chevron);
      root.append(trigger);

      const menu = document.createElement("div");
      menu.className = "fd18-dropdown-menu";
      menu.hidden = true;
      menu.setAttribute("role", "listbox");
      document.body.append(menu);

      state = { select, fallback, top, root, trigger, label, menu };
      dropdownStates.set(select.id, state);

      trigger.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const opening = menu.hidden;
        closeDropdowns(opening ? select.id : null);
        syncDropdown(state);
        menu.hidden = !opening;
        root.classList.toggle("open", opening);
        trigger.setAttribute("aria-expanded", opening ? "true" : "false");
        if (opening) positionDropdown(state);
      });
      select.addEventListener("change", () => syncDropdown(state));
      new MutationObserver(() => syncDropdown(state)).observe(
        select,
        { childList: true, subtree: true, attributes: true }
      );
    }

    state.top = top;
    state.root.classList.toggle("fd18-dropdown-top", top);
    syncDropdown(state);
    return state;
  }

  function restoreCompositeSelects() {
    removeLegacyDropdowns();

    const topbar = document.querySelector(".workspace > .topbar");
    const actions = topbar?.querySelector(".top-actions");
    let topLeft = $("fd17-top-left");
    if (!topLeft && topbar && actions) {
      topLeft = document.createElement("div");
      topLeft.id = "fd17-top-left";
      topbar.insertBefore(topLeft, actions);
    }

    for (const id of ["robot-show-map", "car-show-map"]) {
      const label = $(id)?.closest("label");
      if (label && topLeft) {
        label.classList.add("fd17-layer-toggle");
        topLeft.append(label);
      }
    }

    const standard = [
      ["partial-sessions", "refresh-partials", "No saved sessions"],
      ["maps", "refresh-maps", "Select map"],
      ["car-maps", "car-refresh-maps", "Select map"]
    ];
    for (const [selectId, refreshId, fallback] of standard) {
      const select = $(selectId);
      const refresh = $(refreshId);
      const row = select?.closest(".select-row");
      if (!select || !row) continue;
      const state = ensureCompositeDropdown(select, fallback);
      if (!state) continue;
      row.classList.add("fd18-composite-row");
      row.replaceChildren(select, state.root, ...(refresh ? [refresh] : []));
      refresh?.classList.add("fd17-refresh");
    }

    const pick = $("car-pick-mode");
    if (pick && topLeft) {
      const sourceLabel = pick.closest("label");
      if (sourceLabel && sourceLabel !== topLeft) {
        sourceLabel.style.setProperty("display", "none", "important");
      }
      const state = ensureCompositeDropdown(pick, "G1 destination", true);
      if (state) topLeft.append(pick, state.root);
    }

    if (!dropdownEventsInstalled) {
      dropdownEventsInstalled = true;
      /* Clicks on a trigger are left to its own open/close toggle. */
      document.addEventListener("click", event => {
        if (!event.target.closest?.(".fd18-dropdown")) closeDropdowns();
      }, true);
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeDropdowns();
      });
      window.addEventListener("resize", () => {
        for (const state of dropdownStates.values()) positionDropdown(state);
      });
      window.addEventListener("scroll", () => {
        for (const state of dropdownStates.values()) positionDropdown(state);
      }, true);
    }
  }

  function titleFromLeft(name, subtitle) {
    const cards = [...document.querySelectorAll(
      ".control-panel:not(.car-side) .control-card"
    )];
    const reference = cards.find(card =>
      card.querySelector("h2")?.textContent.trim().toLowerCase() === name.toLowerCase()
    )?.querySelector(".card-title") || cards[0]?.querySelector(".card-title");
    if (!reference) return null;
    const title = reference.cloneNode(true);
    const heading = title.querySelector("h2");
    const copy = title.querySelector("p");
    if (heading) heading.textContent = name;
    if (copy) copy.textContent = subtitle;
    return title;
  }

  function makeCard(id, name, subtitle, reference) {
    let card = $(id);
    if (card) return card;
    card = document.createElement("section");
    card.id = id;
    card.className = reference?.className || "control-card";
    const title = titleFromLeft(name, subtitle);
    const body = document.createElement("div");
    body.className = "card-body";
    if (title) card.append(title);
    card.append(body);
    return card;
  }

  function labelBefore(id) {
    const previous = $(id)?.closest(".field-grid")?.previousElementSibling;
    return previous?.classList.contains("field-label") ? previous : null;
  }

  function cloneSegmentVisual(target, source) {
    if (!target || !source) return;
    target.className = source.className;
    target.replaceChildren(...[...source.childNodes].map(node => node.cloneNode(true)));
  }

  function buildCarStartStop() {
    const start = $("car-go");
    const stop = $("car-stop");
    if (!start || !stop) return null;
    let group = $("fd18-car-nav-switch");
    if (!group) {
      group = document.createElement("div");
      group.id = "fd18-car-nav-switch";
      group.className = "fd15-live-switch fd18-car-nav-switch";
    }
    const mapping = $("fd15MappingControls")?.querySelector(".fd15-live-switch");
    const left = mapping?.querySelector(".fd15-left");
    const right = mapping?.querySelector(".fd15-right");
    if (!start.dataset.fd18SegmentVisual && left) {
      cloneSegmentVisual(start, left);
      start.dataset.fd18SegmentVisual = "1";
    }
    if (!stop.dataset.fd18SegmentVisual && right) {
      cloneSegmentVisual(stop, right);
      stop.dataset.fd18SegmentVisual = "1";
    }
    start.classList.add("fd15-left");
    stop.classList.add("fd15-right");
    // The car reports no "route in progress" state: Start is highlighted only
    // when a previewed route is ready to send; Stop always stays available.
    group.dataset.mode = start.disabled ? "none" : "left-green";
    group.replaceChildren(start, stop);
    if (!group.dataset.fd18ModeObserver) {
      group.dataset.fd18ModeObserver = "1";
      new MutationObserver(() => {
        group.dataset.mode = start.disabled ? "none" : "left-green";
      }).observe(start, { attributes: true, attributeFilter: ["disabled"] });
    }
    return group;
  }

  /* Visible buttons that stand for a hidden original, so the loading state of
     the original is also shown on what the operator actually clicked. */
  const busyProxies = new Map();
  window.slamButtonBusy = (button, busy) => {
    if (!button) return;
    for (const element of [button, ...(busyProxies.get(button) || [])]) {
      element.classList.toggle("fd18-busy", busy);
      if (busy) element.setAttribute("aria-busy", "true");
      else element.removeAttribute("aria-busy");
    }
  };

  function registerBusyProxies() {
    const pairs = [
      ["fd15MappingControls", [["start-map", 0, ".fd15-left"], ["stop-map", 0, ".fd15-right"],
        ["pause-map", 1, ".fd15-left"], ["pause-map", 1, ".fd15-right"]]],
      ["fd15NavigationControls", [["navigate", 0, ".fd15-left"], ["stop-navigation", 0, ".fd15-right"],
        ["pause", 1, ".fd15-left"], ["resume", 1, ".fd15-right"]]],
    ];
    for (const [rootId, entries] of pairs) {
      const switches = $(rootId)?.querySelectorAll(".fd15-live-switch");
      if (!switches) continue;
      for (const [id, index, side] of entries) {
        const original = $(id);
        const proxy = switches[index]?.querySelector(side);
        if (!original || !proxy) continue;
        const list = busyProxies.get(original) || [];
        if (!list.includes(proxy)) busyProxies.set(original, [...list, proxy]);
      }
    }
  }

  // The car Pause/Resume switch is the robot Navigation Pause/Resume switch,
  // cloned without its listeners and wired to the hidden car buttons.
  function buildCarPauseResume() {
    const pause = $("car-pause");
    const resume = $("car-resume");
    const source = $("fd15NavigationControls")?.querySelectorAll(".fd15-live-switch")[1];
    if (!pause || !resume || !source) return null;
    let group = $("fd18-car-pause-switch");
    if (!group) {
      group = source.cloneNode(true);
      group.id = "fd18-car-pause-switch";
      group.removeAttribute("style");
      const left = group.querySelector(".fd15-left");
      const right = group.querySelector(".fd15-right");
      left.addEventListener("click", () => { if (!pause.disabled) pause.click(); });
      right.addEventListener("click", () => { if (!resume.disabled) resume.click(); });
      busyProxies.set(pause, [left]);
      busyProxies.set(resume, [right]);
      const row = pause.parentElement;
      const originals = document.createElement("div");
      originals.id = "fd18-car-pause-originals";
      originals.hidden = true;
      originals.append(pause, resume);
      row?.replaceWith(originals);
    }
    return group;
  }

  function splitCarSidebar() {
    const navigation = $("car-panel");
    const navigationBody = navigation?.querySelector(":scope > .card-body");
    const scroll = navigation?.parentElement;
    if (!navigation || !navigationBody || !scroll) return;

    // Nodes that leave the old card must be placed before its body is rebuilt.
    placeCarAlignInTopbar();

    const mapping = makeCard("fd18-car-mapping-section", "Mapping", "Car map", navigation);
    const localizationCard = makeCard(
      "fd18-car-localization-section", "Map & Localization", "Car map and initial pose", navigation
    );
    const manual = makeCard(
      "fd18-car-manual-section", "Manual Correction", "Map alignment and correction", navigation
    );
    const mappingBody = mapping.querySelector(":scope > .card-body");
    const localizationBody = localizationCard.querySelector(":scope > .card-body");
    const manualBody = manual.querySelector(":scope > .card-body");
    if (!mappingBody || !localizationBody || !manualBody) return;

    const mappingButton = $("car-mapping");
    const mapName = $("car-map-name")?.closest(".input-action");
    if (mappingButton) mappingBody.append(mappingButton);
    if (mapName) mappingBody.append(mapName);

    const oldTitle = navigation.querySelector(":scope > .card-title");
    if (!navigation.dataset.fd18Retitled) {
      const title = titleFromLeft("Navigation", "Car routes");
      if (oldTitle && title) oldTitle.replaceWith(title);
      navigation.dataset.fd18Retitled = "1";
    }

    const localization = $("car-localization");
    const mapRow = $("car-maps")?.closest(".select-row");
    const mapActions = $("car-map-actions");
    const clearView = $("car-clear-view");
    const initialGrid = $("car-pose-x")?.closest(".field-grid");
    const initialLabel = labelBefore("car-pose-x");
    const initialButton = $("car-initial-pose");
    const goalGrid = $("car-goal-x")?.closest(".field-grid");
    const goalLabel = labelBefore("car-goal-x");
    const preview = $("car-preview");
    const startStop = buildCarStartStop();
    // Until the robot switch it is cloned from exists, keep the plain row.
    const pauseResume = buildCarPauseResume() || $("car-pause-row");
    const status = $("car-status");
    const tfGrid = $("car-tf-x")?.closest(".field-grid");
    const flip = $("car-tf-flip");
    const standalone = $("car-standalone");
    const transform = $("car-transform");
    const mapFile = $("car-map-file");
    const slamParams = $("car-slam-params");
    const refine = $("car-refine-icp");
    const result = $("car-result");

    if (initialLabel) initialLabel.textContent = "Initial pose";
    if (goalLabel) goalLabel.textContent = "Destination";

    /* Resolve every live node before any body is rebuilt. */
    localizationBody.replaceChildren(...[
      localization, mapRow, mapActions, clearView, initialLabel, initialGrid, initialButton
    ].filter(Boolean));
    navigationBody.replaceChildren(...[
      goalLabel, goalGrid, preview, startStop, pauseResume,
      $("fd18-car-pause-originals"), status
    ].filter(Boolean));
    let pair = $("fd18-manual-pair");
    if (!pair) {
      pair = document.createElement("div");
      pair.id = "fd18-manual-pair";
      pair.className = "button-row";
    }
    pair.replaceChildren(...[standalone, flip].filter(Boolean));
    manualBody.replaceChildren(...[
      tfGrid, pair, transform,
      mapFile, slamParams, refine, result
    ].filter(Boolean));

    scroll.prepend(mapping);
    mapping.insertAdjacentElement("afterend", localizationCard);
    localizationCard.insertAdjacentElement("afterend", navigation);
    navigation.insertAdjacentElement("afterend", manual);
  }

  // The car "Align" action sits next to Fit view with the same toolbar look.
  function placeCarAlignInTopbar() {
    const align = $("car-align");
    const fit = $("fit-map");
    if (!align || !fit) return;
    align.textContent = "Align";
    align.className = fit.className;
    align.removeAttribute("style");
    if (fit.nextElementSibling !== align) fit.after(align);
  }

  // Robot Navigation: Preview above the Start/Stop switch, as in Car Control.
  function placeRobotPreviewFirst() {
    const root = $("fd15NavigationControls");
    const preview = $("preview-route");
    if (root && preview && root.firstElementChild !== preview) root.prepend(preview);
  }

  // Same scroll indicator and animation as the left rail, on the right rail.
  const railScrollOwners = new Map();
  function installRailScroll(side) {
    const selector = side === "left"
      ? ".app-shell > .control-panel:not(.car-side) > .panel-scroll"
      : ".app-shell > .control-panel.car-side > .panel-scroll";
    const rail = document.querySelector(selector);
    if (!rail || railScrollOwners.has(side)) return;
    const indicator = document.createElement("div");
    indicator.className = "fd18-live-scroll-indicator";
    indicator.setAttribute("aria-hidden", "true");
    document.body.append(indicator);
    let hideTimer = null;
    let frame = null;
    const update = () => {
      frame = null;
      const rect = rail.getBoundingClientRect();
      if (rail.scrollHeight <= rail.clientHeight + 2) {
        indicator.classList.remove("visible");
        return;
      }
      const height = Math.max(20, Math.min(46, rect.height * rail.clientHeight / rail.scrollHeight));
      const progress = rail.scrollTop / Math.max(1, rail.scrollHeight - rail.clientHeight);
      indicator.style.height = `${height}px`;
      indicator.style.top = `${rect.top + (rect.height - height) * progress}px`;
      indicator.style.left = side === "left" ? `${rect.left + 1}px` : `${rect.right - 3}px`;
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(update);
    };
    rail.style.setProperty("scroll-behavior", "smooth");
    rail.addEventListener("scroll", () => {
      schedule();
      indicator.classList.add("visible");
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => indicator.classList.remove("visible"), 480);
    }, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    railScrollOwners.set(side, { rail, indicator, schedule });
    schedule();
  }

  function placeFollowCarInTopbar() {
    const followRobot = $("follow-robot");
    const followCar = $("car-center");
    const fit = $("fit-map");
    if (!followRobot || !followCar || !fit) return;

    followCar.textContent = "Follow car";
    followCar.className = followRobot.className;
    followCar.removeAttribute("style");
    fit.parentElement?.insertBefore(followCar, fit);
  }

  function placePoseUnderViewTools() {
    const status = $("fd17-slam-statusbar");
    const pose = status?.querySelector(".pose-bar");
    const fit = $("fit-map");
    if (!status || !pose || !fit) return;

    let semantic = $("fd20-semantic-readout");
    if (!semantic) {
      semantic = document.createElement("div");
      semantic.id = "fd20-semantic-readout";
      semantic.className = "fd20-semantic-readout";
      const label = document.createElement("span");
      label.textContent = "SEMANTICS";
      const count = document.createElement("b");
      count.id = "fd20-semantic-count";
      count.textContent = String(
        Array.isArray(window.latestSemanticChairMessage?.objects)
          ? window.latestSemanticChairMessage.objects.length
          : 0
      );
      semantic.append(label, count);
      status.prepend(semantic);
    }
    status.style.setProperty("position", "relative", "important");
    pose.style.setProperty("position", "absolute", "important");
    pose.style.setProperty("top", "50%", "important");
    pose.style.setProperty("transform", "translateY(-50%)", "important");
    const statusRect = status.getBoundingClientRect();
    const fitRect = fit.getBoundingClientRect();
    const right = Math.max(0, Math.round(statusRect.right - fitRect.right));
    pose.style.setProperty("right", `${right}px`, "important");
    pose.style.setProperty("left", "auto", "important");
  }

  /* Mapping Pause/Resume use the Navigation Pause/Resume icons. Several legacy
     passes rewrite these segments, so an observer restores the icon before paint. */
  function copyMappingPauseIcons() {
    const mapping = $("fd15MappingControls")?.querySelectorAll(".fd15-live-switch")[1];
    const navigation = $("fd15NavigationControls")?.querySelectorAll(".fd15-live-switch")[1];
    if (!mapping || !navigation) return;
    const pairs = [
      [".fd15-left", ".fd15-icon-pause"],
      [".fd15-right", ".fd15-icon-play"]
    ];
    const apply = () => {
      for (const [side, iconClass] of pairs) {
        const target = mapping.querySelector(side);
        const icon = navigation.querySelector(`${side} ${iconClass}`);
        if (!target || !icon || target.querySelector(iconClass)) continue;
        const label = [...target.children].find(node => !node.hasAttribute("aria-hidden"));
        const text = label?.textContent.trim()
          || target.textContent.replace(/[^\p{L}\s]/gu, "").trim();
        const span = document.createElement("span");
        span.textContent = text;
        target.replaceChildren(icon.cloneNode(true), span);
      }
    };
    apply();
    if (mapping.dataset.fd18PauseIconOwner) return;
    mapping.dataset.fd18PauseIconOwner = "1";
    new MutationObserver(apply).observe(mapping, { childList: true, subtree: true });
  }

  /* Robot Mode teleop: visible segments are cloned from the Mapping Start/Stop
     switch and forward clicks to the hidden app.js buttons, so busy-text changes
     on those buttons never reach the visible control. The keyboard-capture node
     is kept hidden with them: keys are captured on the window, and app.js still
     reports the armed state through its class. */
  let teleopUi = null;

  function syncTeleopSwitch() {
    if (!teleopUi) return;
    const { root, enter, stop, left, right, capture } = teleopUi;
    left.disabled = enter.disabled;
    right.disabled = stop.disabled;
    const active = Boolean(capture?.classList.contains("active"));
    root.dataset.side = active ? "right" : "left";
    root.dataset.mode = active ? "right-amber" : "left-green";
  }

  function installTeleopSwitch() {
    if (teleopUi) return syncTeleopSwitch();
    const enter = $("enable-teleop");
    const stop = $("disable-teleop");
    const mapping = $("fd15MappingControls")?.querySelector(".fd15-live-switch");
    const startSegment = mapping?.querySelector(".fd15-left");
    const stopSegment = mapping?.querySelector(".fd15-right");
    const row = enter?.parentElement;
    if (!enter || !stop || !startSegment || !stopSegment || !row) return;

    const segment = (source, text, original) => {
      const button = source.cloneNode(true);
      const label = [...button.children].find(node => !node.hasAttribute("aria-hidden"));
      if (label) label.textContent = text;
      button.addEventListener("click", () => {
        if (!original.disabled) original.click();
      });
      return button;
    };

    const root = document.createElement("div");
    root.id = "fd18-teleop-switch";
    root.className = "fd15-live-switch";
    const indicator = document.createElement("span");
    indicator.className = "fd15-live-indicator";
    indicator.setAttribute("aria-hidden", "true");
    const left = segment(startSegment, "Enter Teleop", enter);
    const right = segment(stopSegment, "Stop Teleop", stop);
    root.append(indicator, left, right);

    const originals = document.createElement("div");
    originals.hidden = true;
    row.replaceWith(root, originals);
    const capture = $("teleop-capture");
    originals.append(...[enter, stop, capture].filter(Boolean));

    teleopUi = { root, enter, stop, left, right, capture };
    busyProxies.set(enter, [left]);
    busyProxies.set(stop, [right]);
    const observer = new MutationObserver(syncTeleopSwitch);
    for (const node of [enter, stop]) {
      observer.observe(node, { attributes: true, attributeFilter: ["disabled"] });
    }
    if (teleopUi.capture) {
      observer.observe(teleopUi.capture, { attributes: true, attributeFilter: ["class"] });
    }
    syncTeleopSwitch();
  }

  /* Navigation and Mapping switches: this is the single owner of their
     highlight and enabled state, derived from the runtime status after every
     refresh. Idle -> only Start; running -> Stop + Pause; paused -> Stop +
     Resume. Legacy passes that rewrite these attributes are corrected at once
     by an observer. */
  const NAV_RUNNING = new Set(["starting", "navigating", "orienting", "blocked"]);
  const switchPlans = new Map();
  let switchObserver = null;
  let runStateSyncInstalled = false;

  function applySwitchPlan(shell) {
    const stored = switchPlans.get(shell);
    const plan = typeof stored === "function" ? stored() : stored;
    const left = shell.querySelector(".fd15-left");
    const right = shell.querySelector(".fd15-right");
    if (!plan || !left || !right) return;
    const side = plan.mode === "none" ? "none" : plan.mode.split("-")[0];
    if (shell.dataset.mode !== plan.mode) shell.dataset.mode = plan.mode;
    if (shell.dataset.side !== side) shell.dataset.side = side;
    if (!plan.manageDisabled) return;
    if (left.disabled !== !plan.leftEnabled) left.disabled = !plan.leftEnabled;
    if (right.disabled !== !plan.rightEnabled) right.disabled = !plan.rightEnabled;
  }

  function syncRunSwitches(next) {
    if (!next) return;
    const [mapRun, mapPause] = $("fd15MappingControls")?.querySelectorAll(".fd15-live-switch") || [];
    const [navRun, navPause] = $("fd15NavigationControls")?.querySelectorAll(".fd15-live-switch") || [];
    const mapping = next.mode === "mapping";
    const mappingPaused = mapping && Boolean(next.mapping_paused);
    const navState = next.navigation?.state || "idle";
    const navPaused = navState === "paused";
    const navActive = NAV_RUNNING.has(navState) || navPaused;
    const plans = [
      [mapRun, { mode: mapping ? "right-amber" : "left-green", leftEnabled: !mapping, rightEnabled: mapping, manageDisabled: true }],
      [mapPause, {
        mode: !mapping ? "none" : mappingPaused ? "right-green" : "left-amber",
        leftEnabled: mapping && !mappingPaused,
        rightEnabled: mappingPaused,
        manageDisabled: true,
      }],
      [navRun, {
        mode: navActive ? "right-amber" : "left-green",
        leftEnabled: !navActive && !$("navigate")?.disabled,
        rightEnabled: navActive,
        manageDisabled: true,
      }],
      [navPause, {
        mode: navPaused ? "right-green" : navActive ? "left-amber" : "none",
        leftEnabled: navActive && !navPaused,
        rightEnabled: navPaused,
        manageDisabled: true,
      }],
    ];
    // Car Start/Stop: the car reports no "route in progress" state, so Start is
    // highlighted only when a previewed route is ready. car.js alone enables or
    // disables Start (as in the standalone dashboard); the plan is evaluated on
    // every application so it follows that state.
    const carSwitch = $("fd18-car-nav-switch");
    const carGo = $("car-go");
    const carNav = () => (typeof window.carNavState === "function" ? window.carNavState() : "idle");
    if (carSwitch && carGo) {
      plans.push([carSwitch, () => ({
        mode: carNav() !== "idle" ? "right-amber" : carGo.disabled ? "none" : "left-green",
      })]);
    }
    const carPause = $("fd18-car-pause-switch");
    if (carPause) {
      plans.push([carPause, () => {
        const state = carNav();
        return {
          mode: state === "paused" ? "right-green" : state === "navigating" ? "left-amber" : "none",
          leftEnabled: state === "navigating",
          rightEnabled: state === "paused",
          manageDisabled: true,
        };
      }]);
    }
    if (!switchObserver) {
      switchObserver = new MutationObserver((records) => {
        for (const record of records) {
          const shell = record.target.closest?.(".fd15-live-switch");
          if (shell && switchPlans.has(shell)) applySwitchPlan(shell);
        }
      });
    }
    for (const [shell, plan] of plans) {
      if (!shell) continue;
      if (!switchPlans.has(shell)) {
        switchObserver.observe(shell, {
          attributes: true, subtree: true, attributeFilter: ["data-mode", "data-side", "disabled"],
        });
      }
      switchPlans.set(shell, plan);
      applySwitchPlan(shell);
    }
  }

  function installRunStateSync() {
    if (runStateSyncInstalled || typeof window.fullDashSyncV15 !== "function") return;
    runStateSyncInstalled = true;
    // The car navigation state changes between runtime refreshes.
    window.addEventListener("car-nav-state", () => {
      for (const shell of switchPlans.keys()) applySwitchPlan(shell);
    });
    const prior = window.fullDashSyncV15;
    window.fullDashSyncV15 = (next) => {
      prior(next);
      syncRunSwitches(next);
    };
  }

  /* CAR ONLINE / CAR OFFLINE chip next to the "CAR CONTROL" title: online
     while the car bridge (ws_bridge_v2) holds its /ws/car connection to the
     runtime, as reported in the car state that car.js polls. */
  // Exact Live look: geometry and typography are copied from the rendered
  // CTRL chip of the Full Dashboard, and the good/warn palette from the
  // --full-status-* variables the Live tab derives from its own buttons.
  const CHIP_PROPERTIES = [
    "height", "min-height", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
    "border-radius", "font-family", "font-size", "font-weight", "font-style", "line-height",
    "letter-spacing", "text-transform", "column-gap", "box-sizing",
  ];
  const DOT_PROPERTIES = ["width", "height", "border-radius"];
  const PALETTE = ["fg", "bg", "bg-image", "border", "shadow"];
  function copyLiveChipStyle(chip) {
    let parentWindow, source;
    try {
      parentWindow = window.parent !== window ? window.parent : null;
      source = parentWindow?.document.getElementById("stitchCtrlChip");
    } catch (_) {
      return;
    }
    if (!source) return;
    const style = parentWindow.getComputedStyle(source);
    const dot = parentWindow.getComputedStyle(source, "::before");
    // A hidden Live tab can report "auto" for layout values; keep the CSS
    // defaults (the same Live rule values) in that case.
    const usable = (value) => value && value !== "auto" && value !== "normal";
    for (const property of CHIP_PROPERTIES) {
      const value = style.getPropertyValue(property);
      if (usable(value)) chip.style.setProperty(property, value, "important");
    }
    for (const property of DOT_PROPERTIES) {
      const value = dot.getPropertyValue(property);
      if (usable(value)) chip.style.setProperty(`--fd18-chip-dot-${property}`, value);
    }
    const rootStyle = parentWindow.getComputedStyle(parentWindow.document.documentElement);
    for (const tone of ["good", "warn"]) {
      for (const part of PALETTE) {
        const value = rootStyle.getPropertyValue(`--full-status-${tone}-${part}`).trim();
        if (value) chip.style.setProperty(`--full-status-${tone}-${part}`, value);
      }
    }
  }

  function installCarOnlineChip() {
    const panel = document.querySelector(".app-shell > .control-panel.car-side");
    if (!panel || $("fd18-car-online-chip")) return;
    const chip = document.createElement("span");
    chip.id = "fd18-car-online-chip";
    chip.className = "warn";
    chip.setAttribute("role", "status");
    chip.textContent = "CAR OFFLINE";
    panel.append(chip);
    copyLiveChipStyle(chip);
    setTimeout(() => copyLiveChipStyle(chip), 1500);
    window.addEventListener("robot-car-state", (event) => {
      const online = Boolean(event.detail?.connected);
      chip.classList.toggle("good", online);
      chip.classList.toggle("warn", !online);
      chip.textContent = online ? "CAR ONLINE" : "CAR OFFLINE";
    });
  }

  function requestedPreviewButtons() {
    return [
      $("car-localization"),
      $("car-mapping"),
      $("follow-robot"),
      $("car-center"),
      $("fit-map"),
      $("car-align")
    ].filter(Boolean);
  }


  function normalizePreviewButtons() {
    const properties = [
      "height", "min-height", "max-height", "padding", "background",
      "background-color", "border", "border-width", "border-style",
      "border-color", "border-radius", "box-shadow", "color", "font",
      "font-family", "font-size", "font-weight", "font-style", "line-height",
      "letter-spacing", "text-transform", "display", "align-items",
      "justify-content", "gap", "transition", "transform"
    ];
    for (const button of requestedPreviewButtons()) {
      button.classList.add("fd18-preview-action");
      for (const property of properties) button.style.removeProperty(property);
    }
  }

  function installButtonStyleGuard() {
    normalizePreviewButtons();
    if (buttonStyleGuardInstalled) return;
    buttonStyleGuardInstalled = true;
    const observer = new MutationObserver(() => {
      if (buttonStyleRepairQueued) return;
      buttonStyleRepairQueued = true;
      requestAnimationFrame(() => {
        normalizePreviewButtons();
        buttonStyleRepairQueued = false;
      });
    });
    for (const button of requestedPreviewButtons()) {
      observer.observe(button, { attributes: true, attributeFilter: ["style"] });
    }
  }

  function panelLayout() {
    const shell = document.querySelector(".app-shell");
    const robot = shell?.querySelector(":scope > .control-panel:not(.car-side)");
    const map = shell?.querySelector(":scope > .workspace");
    const car = shell?.querySelector(":scope > .control-panel.car-side");
    return shell && robot && map && car ? { shell, elements: { robot, map, car } } : null;
  }

  function retireLegacyPanelDrag(layout) {
    const selector = [
      ".fd-slam-major-handle-v5", ".fd-slam-major-handle-v8", ".fd151-live-handle",
      ".fd16-major-handle", ".fd163-major-handle", ".fd164-major-handle",
      ".fd165-major-handle"
    ].join(",");
    layout.shell.querySelectorAll(selector).forEach(handle => handle.remove());
    for (const section of Object.values(layout.elements)) {
      section.classList.remove(
        "fd163-major-following", "fd164-major-following", "fd165-major-following",
        "fd152-major-following", "fd-major-drag-node-v8"
      );
      section.style.removeProperty("transform");
      section.style.removeProperty("--fd152-drag-x");
      section.style.removeProperty("--fd164-major-drag-x");
    }
  }

  function panelsInVisualOrder(layout = panelLayout()) {
    if (!layout) return [];
    return Object.values(layout.elements).sort(
      (a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left
    );
  }

  function panelKey(panel) {
    return panel?.dataset.fd18MajorKey || "";
  }

  function resizeGap(layout) {
    const value = parseFloat(getComputedStyle(layout.shell).columnGap);
    return Number.isFinite(value) ? value : 8;
  }

  function resizeAvailable(layout) {
    return Math.max(0, layout.shell.getBoundingClientRect().width - resizeGap(layout) * 2);
  }

  /* Floors are the first clean widths: labels remain whole and toolbars never collide. */
  function resizeBounds(key, available) {
    if (key === "robot") return { min: 300, max: Math.min(520, available - 1100) };
    if (key === "car") return { min: 300, max: Math.min(520, available - 1100) };
    return { min: 800, max: Math.max(800, available - 600) };
  }

  function currentPanelWidths(layout, panels = panelsInVisualOrder(layout)) {
    const widths = {};
    for (const panel of panels) widths[panelKey(panel)] = panel.getBoundingClientRect().width;
    return widths;
  }

  function applyPanelWidths(layout, widths, panels = panelsInVisualOrder(layout)) {
    if (panels.length !== 3) return;
    const fitted = fitPanelWidths(widths, resizeAvailable(layout));
    requestedWidths = Object.fromEntries(
      PANEL_KEYS.map(key => [key, `${Math.max(1, Math.round(fitted[key]))}px`])
    );
    const template = panels
      .map(panel => `${Math.max(1, Math.round(fitted[panelKey(panel)]))}px`)
      .join(" ");
    layout.shell.style.setProperty("grid-template-columns", template, "important");
  }

  function savePanelWidths(layout) {
    const widths = currentPanelWidths(layout);
    const total = PANEL_KEYS.reduce((sum, key) => sum + (widths[key] || 0), 0);
    if (total <= 0) return;
    const fractions = {};
    for (const key of PANEL_KEYS) fractions[key] = widths[key] / total;
    try { localStorage.setItem(WIDTH_STORE, JSON.stringify(fractions)); } catch (_) {}
  }

  function fitPanelWidths(desired, available) {
    const result = {};
    for (const key of PANEL_KEYS) {
      const bounds = resizeBounds(key, available);
      result[key] = Math.max(bounds.min, Math.min(bounds.max, desired[key]));
    }
    for (let pass = 0; pass < 12; pass += 1) {
      const difference = available - PANEL_KEYS.reduce((sum, key) => sum + result[key], 0);
      if (Math.abs(difference) < .5) break;
      const candidates = PANEL_KEYS.filter(key => {
        const bounds = resizeBounds(key, available);
        return difference > 0 ? result[key] < bounds.max - .25 : result[key] > bounds.min + .25;
      });
      if (!candidates.length) break;
      for (const key of candidates) {
        const bounds = resizeBounds(key, available);
        result[key] = Math.max(bounds.min, Math.min(bounds.max,
          result[key] + difference / candidates.length));
      }
    }
    return result;
  }

  function restorePanelWidths(layout) {
    let fractions = null;
    try { fractions = JSON.parse(localStorage.getItem(WIDTH_STORE) || "null"); } catch (_) {}
    if (!fractions || PANEL_KEYS.some(key => !Number.isFinite(Number(fractions[key])))) return;
    const available = resizeAvailable(layout);
    const desired = {};
    for (const key of PANEL_KEYS) desired[key] = Number(fractions[key]) * available;
    applyPanelWidths(layout, fitPanelWidths(desired, available));
  }

  function synchronizePanelWidths(layout = panelLayout()) {
    if (!layout || resizeState || dragOwner?.dragging) return;
    const panels = panelsInVisualOrder(layout);
    if (panels.length !== 3) return;
    const available = resizeAvailable(layout);
    if (available <= 0) return;
    const widths = currentPanelWidths(layout, panels);
    const total = PANEL_KEYS.reduce((sum, key) => sum + (Number(widths[key]) || 0), 0);
    if (total <= 0 || Math.abs(total - available) < 1) return;

    const scale = available / total;
    const scaled = {};
    for (const key of PANEL_KEYS) scaled[key] = (Number(widths[key]) || 0) * scale;
    applyPanelWidths(layout, scaled, panels);
  }

  function installPanelWidthObserver() {
    const layout = panelLayout();
    if (!layout || panelWidthObserver) return;
    let frame = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        synchronizePanelWidths(layout);
      });
    };
    panelWidthObserver = new ResizeObserver(schedule);
    panelWidthObserver.observe(layout.shell);
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("pageshow", schedule, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) schedule();
    });
    const styleOwner = new MutationObserver(() => {
      if (resizeState || dragOwner?.dragging || !requestedWidths) return;
      const panels = panelsInVisualOrder(layout);
      const expected = panels.map(panel => requestedWidths[panelKey(panel)]).join(" ");
      const actual = layout.shell.style.getPropertyValue("grid-template-columns").trim();
      const canonical = value => value.replace(/\s+/g, "").replace(/0px/g, "0");
      if (canonical(actual) !== canonical(expected)) layout.shell.style.setProperty(
        "grid-template-columns", expected, "important"
      );
    });
    styleOwner.observe(layout.shell, { attributes: true, attributeFilter: ["style"] });
    schedule();
    requestAnimationFrame(schedule);
    setTimeout(schedule, 120);
    setTimeout(schedule, 500);
  }

  function updateResizeEdges(layout = panelLayout()) {
    if (!layout) return;
    const panels = panelsInVisualOrder(layout);
    panels.forEach((panel, index) => {
      const left = panel.querySelector(":scope > .stitch-resize-edge-v1931[data-side='left']");
      const right = panel.querySelector(":scope > .stitch-resize-edge-v1931[data-side='right']");
      left?.classList.toggle("stitch-resize-disabled-v1931", index === 0);
      right?.classList.toggle("stitch-resize-disabled-v1931", index === panels.length - 1);
    });
  }

  function flushResize() {
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    resizeFrame = null;
    if (!queuedResize) return;
    const queued = queuedResize;
    queuedResize = null;
    applyPanelWidths(queued.layout, queued.widths, queued.panels);
  }

  function queuePanelResize(layout, widths, panels) {
    queuedResize = { layout, widths: { ...widths }, panels: [...panels] };
    if (resizeFrame !== null) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      if (!queuedResize) return;
      const queued = queuedResize;
      queuedResize = null;
      applyPanelWidths(queued.layout, queued.widths, queued.panels);
    });
  }

  function movePanelResize(event) {
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    event.preventDefault();
    const delta = event.clientX - resizeState.startX;
    const total = resizeState.leftStart + resizeState.rightStart;
    const minimumLeft = Math.max(resizeState.leftBounds.min, total - resizeState.rightBounds.max);
    const maximumLeft = Math.min(resizeState.leftBounds.max, total - resizeState.rightBounds.min);
    const left = Math.max(minimumLeft, Math.min(maximumLeft, resizeState.leftStart + delta));
    resizeState.widths[resizeState.leftKey] = left;
    resizeState.widths[resizeState.rightKey] = total - left;
    queuePanelResize(resizeState.layout, resizeState.widths, resizeState.panels);
  }

  function finishPanelResize(event, cancelled) {
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    event.preventDefault();
    const state = resizeState;
    flushResize();
    if (cancelled) applyPanelWidths(state.layout, state.startWidths, state.panels);
    try { state.handle.releasePointerCapture(event.pointerId); } catch (_) {}
    state.handle.classList.remove("stitch-resize-active-v1931");
    document.body.classList.remove("stitch-major-resizing-v1931");
    document.removeEventListener("pointermove", movePanelResize, true);
    document.removeEventListener("pointerup", finishPanelResizeUp, true);
    document.removeEventListener("pointercancel", cancelPanelResize, true);
    resizeState = null;
    updateResizeEdges(state.layout);
    if (!cancelled) savePanelWidths(state.layout);
  }

  const finishPanelResizeUp = event => finishPanelResize(event, false);
  const cancelPanelResize = event => finishPanelResize(event, true);

  function beginPanelResize(event, panel, side, handle, layout) {
    if (event.button !== 0 || resizeState || dragOwner?.dragging) return;
    const panels = panelsInVisualOrder(layout);
    const index = panels.indexOf(panel);
    const leftPanel = side === "right" ? panel : panels[index - 1];
    const rightPanel = side === "right" ? panels[index + 1] : panel;
    if (!leftPanel || !rightPanel) return;
    event.preventDefault();
    event.stopPropagation();
    const widths = currentPanelWidths(layout, panels);
    const available = resizeAvailable(layout);
    const leftKey = panelKey(leftPanel);
    const rightKey = panelKey(rightPanel);
    resizeState = {
      pointerId: event.pointerId, handle, layout, panels,
      startX: event.clientX, widths: { ...widths }, startWidths: { ...widths },
      leftKey, rightKey, leftStart: widths[leftKey], rightStart: widths[rightKey],
      leftBounds: resizeBounds(leftKey, available), rightBounds: resizeBounds(rightKey, available)
    };
    document.body.classList.add("stitch-major-resizing-v1931");
    handle.classList.add("stitch-resize-active-v1931");
    try { handle.setPointerCapture(event.pointerId); } catch (_) {}
    document.addEventListener("pointermove", movePanelResize, true);
    document.addEventListener("pointerup", finishPanelResizeUp, true);
    document.addEventListener("pointercancel", cancelPanelResize, true);
  }

  function installLivePanelResize() {
    const layout = panelLayout();
    if (!layout || resizeOwner) return;
    for (const panel of Object.values(layout.elements)) {
      for (const side of ["left", "right"]) {
        const edge = document.createElement("div");
        edge.className = "stitch-resize-edge-v1931";
        edge.dataset.side = side;
        edge.setAttribute("aria-hidden", "true");
        edge.addEventListener("pointerdown", event => beginPanelResize(event, panel, side, edge, layout));
        panel.append(edge);
      }
    }
    resizeOwner = { layout };
    updateResizeEdges(layout);
    restorePanelWidths(layout);
  }

  function installLivePanelDrag() {
    const layout = panelLayout();
    if (!layout) return;
    retireLegacyPanelDrag(layout);
    if (!requestedWidths) {
      let liveRailWidth = 344;
      try {
        const measured = window.parent?.document
          ?.querySelector("#view-live .combined-rail")
          ?.getBoundingClientRect().width;
        if (Number.isFinite(measured) && measured > 0) liveRailWidth = measured;
      } catch (_) {}
      requestedWidths = {
        robot: "320px",
        map: "minmax(0,1fr)",
        car: `${Math.round(liveRailWidth)}px`
      };
    }
    for (const key of PANEL_KEYS) {
      layout.elements[key].dataset.fd18MajorKey = key;
      layout.elements[key].classList.add("fd18-major-surface", "stitch-major-v1924");
    }
    let order = [...PANEL_KEYS];
    try {
      const saved = JSON.parse(localStorage.getItem(PANEL_STORE) || "null");
      if (Array.isArray(saved) && saved.length === 3
          && saved.every(key => PANEL_KEYS.includes(key))) order = [...saved];
    } catch (_) {}

    const applyOrder = next => {
      layout.shell.style.setProperty(
        "grid-template-columns", next.map(key => requestedWidths[key]).join(" "), "important"
      );
      next.forEach((key, index) => {
        const panel = layout.elements[key];
        panel.style.setProperty("grid-column", String(index + 1), "important");
        panel.style.setProperty("grid-row", "1", "important");
      });
      layout.shell.getBoundingClientRect();
    };
    applyOrder(order);
    const existingHandles = layout.shell.querySelectorAll(".fd18-major-handle");
    if (dragOwner && existingHandles.length === 3) return;
    if (dragOwner) {
      existingHandles.forEach(handle => handle.remove());
      dragOwner = null;
    }

    const animations = new WeakMap();
    let drag = null;
    const cancelAnimation = panel => {
      const animation = animations.get(panel);
      if (!animation) return;
      try { animation.cancel(); } catch (_) {}
      animations.delete(panel);
    };
    const cancelAnimations = except => {
      for (const panel of Object.values(layout.elements)) {
        if (panel !== except) cancelAnimation(panel);
      }
    };
    const captureRects = except => {
      const result = new Map();
      for (const panel of Object.values(layout.elements)) {
        if (panel !== except) result.set(panel, panel.getBoundingClientRect());
      }
      return result;
    };
    const animateFrom = (before, except) => {
      for (const [panel, oldRect] of before) {
        if (panel === except) continue;
        cancelAnimation(panel);
        const nextRect = panel.getBoundingClientRect();
        const dx = oldRect.left - nextRect.left;
        const dy = oldRect.top - nextRect.top;
        if (Math.abs(dx) < .5 && Math.abs(dy) < .5) continue;
        try {
          const animation = panel.animate([
            { transform: `translate3d(${dx}px,${dy}px,0) scale(.985)` },
            { transform: "translate3d(0,0,0) scale(1)" }
          ], { duration: FLIP_MS, easing: FLIP_EASING, fill: "both" });
          animations.set(panel, animation);
          animation.addEventListener("finish", () => {
            if (animations.get(panel) === animation) animations.delete(panel);
            animation.cancel();
          }, { once: true });
        } catch (_) {}
      }
    };
    const targetIndex = clientX => {
      const rect = layout.shell.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(.999999,
        (clientX - rect.left) / Math.max(1, rect.width)));
      return ratio < 1 / 3 ? 0 : ratio < 2 / 3 ? 1 : 2;
    };
    const candidateOrder = (key, index, start) => {
      const result = start.filter(item => item !== key);
      result.splice(index, 0, key);
      return result;
    };
    const sameOrder = (a, b) =>
      a.length === b.length && a.every((value, index) => value === b[index]);
    const move = event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const desiredLeft = event.clientX - drag.grabOffset;
      drag.dx = desiredLeft - drag.baseLeft;
      drag.panel.style.setProperty("--fd18-major-drag-x", `${drag.dx}px`);
      const candidate = candidateOrder(
        drag.key, targetIndex(event.clientX), drag.startOrder
      );
      if (sameOrder(candidate, drag.currentOrder)) return;
      const before = captureRects(drag.panel);
      cancelAnimations(drag.panel);
      const oldDx = drag.dx;
      applyOrder(candidate);
      const visualWithOldTransform = drag.panel.getBoundingClientRect().left;
      drag.baseLeft = visualWithOldTransform - oldDx;
      drag.dx = desiredLeft - drag.baseLeft;
      drag.panel.style.setProperty("--fd18-major-drag-x", `${drag.dx}px`);
      animateFrom(before, drag.panel);
      drag.currentOrder = [...candidate];
      drag.targetOrder = [...candidate];
    };
    const cleanup = () => {
      if (!drag) return;
      drag.panel.classList.remove("fd18-major-following");
      drag.panel.classList.remove("stitch-major-following-v1924");
      drag.handle.classList.remove("fd18-major-handle-active");
      drag.handle.classList.remove("stitch-major-handle-active-v1924");
      drag.panel.style.removeProperty("--fd18-major-drag-x");
      document.body.classList.remove("fd18-major-dragging");
      document.body.classList.remove("stitch-major-dragging-v1924");
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", finishUp, true);
      document.removeEventListener("pointercancel", finishCancel, true);
    };
    const finish = (event, cancelled) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const before = captureRects();
      cancelAnimations();
      const finalOrder = cancelled ? drag.startOrder : drag.targetOrder;
      try { drag.handle.releasePointerCapture(event.pointerId); } catch (_) {}
      drag.panel.classList.remove("fd18-major-following");
      drag.panel.classList.remove("stitch-major-following-v1924");
      drag.panel.style.removeProperty("--fd18-major-drag-x");
      applyOrder(finalOrder);
      animateFrom(before);
      if (!cancelled) {
        order = [...finalOrder];
        try { localStorage.setItem(PANEL_STORE, JSON.stringify(order)); } catch (_) {}
      }
      updateResizeEdges(layout);
      if (dragOwner) dragOwner.dragging = false;
      cleanup();
      drag = null;
    };
    const finishUp = event => finish(event, false);
    const finishCancel = event => finish(event, true);

    for (const key of PANEL_KEYS) {
      const panel = layout.elements[key];
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "fd18-major-handle stitch-major-handle-v1924";
      handle.setAttribute("aria-label", `Move ${key} section`);
      handle.title = `Drag ${key} section`;
      const grip = document.createElement("span");
      grip.className = "fd18-major-grip stitch-major-grip-v1924";
      grip.setAttribute("aria-hidden", "true");
      handle.append(grip);
      handle.addEventListener("pointerdown", event => {
        if (event.button !== 0 || drag) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelAnimations();
        const rect = panel.getBoundingClientRect();
        drag = {
          pointerId: event.pointerId, key, handle, panel,
          grabOffset: event.clientX - rect.left, baseLeft: rect.left, dx: 0,
          startOrder: [...order], currentOrder: [...order], targetOrder: [...order]
        };
        panel.classList.add("fd18-major-following");
        panel.classList.add("stitch-major-following-v1924");
        handle.classList.add("fd18-major-handle-active");
        handle.classList.add("stitch-major-handle-active-v1924");
        document.body.classList.add("fd18-major-dragging");
        document.body.classList.add("stitch-major-dragging-v1924");
        if (dragOwner) dragOwner.dragging = true;
        try { handle.setPointerCapture(event.pointerId); } catch (_) {}
        document.addEventListener("pointermove", move, true);
        document.addEventListener("pointerup", finishUp, true);
        document.addEventListener("pointercancel", finishCancel, true);
      }, true);
      panel.prepend(handle);
    }
    dragOwner = { layout, applyOrder, dragging: false };
  }

  function installLateOwnerGuard() {
    if (lateOwnerGuardInstalled) return;
    lateOwnerGuardInstalled = true;

    const legacyHandleSelector = [
      ".fd-slam-major-handle-v5", ".fd-slam-major-handle-v8", ".fd151-live-handle",
      ".fd16-major-handle", ".fd163-major-handle", ".fd164-major-handle",
      ".fd165-major-handle"
    ].join(",");
    const legacyDropdownSelector = [
      ".fd-partial-dropdown-v6", ".fd-map-dropdown-v7", ".fd16-dropdown",
      ".fd162-dropdown", ".fd163-dropdown", ".fd164-dropdown",
      ".fd166-select-shell", ".fd17-health-dropdown", ".fd13-select-menu"
    ].join(",");

    const observer = new MutationObserver(() => {
      const needsRepair =
        document.querySelectorAll(".fd18-major-handle").length !== 3
        || Boolean(document.querySelector(legacyHandleSelector))
        || Boolean(document.querySelector(legacyDropdownSelector));
      if (!needsRepair || lateRepairQueued) return;

      lateRepairQueued = true;
      window.setTimeout(() => {
        restoreCompositeSelects();
        installLivePanelDrag();
        lateRepairQueued = false;
      }, 0);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }


  function fd21ParentDocument() {
    try {
      return window.parent && window.parent !== window
        ? window.parent.document
        : null;
    } catch (_) {
      return null;
    }
  }


  function fd21FindLiveCameraCard(parentDoc, wanted) {
    if (!parentDoc) return null;
    const target = String(wanted).trim().toUpperCase();
    const nodes = parentDoc.querySelectorAll(
      "#view-live strong,#view-live h1,#view-live h2,#view-live h3,#view-live span,#view-live div"
    );

    for (const node of nodes) {
      if (String(node.textContent || "").trim().toUpperCase() !== target) continue;
      let current = node;
      for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
        const rect = current.getBoundingClientRect();
        if (rect.width >= 160 && rect.height >= 90) return current;
      }
    }
    return null;
  }

  function fd21CopyLiveCameraStyle() {
    const parentDoc = fd21ParentDocument();
    if (!parentDoc) return;

    const reference =
      fd21FindLiveCameraCard(parentDoc, "ROBOT RGB")
      || fd21FindLiveCameraCard(parentDoc, "DEPTH");
    if (!reference) return;

    let titleNode = null;
    for (const node of reference.querySelectorAll("strong,h1,h2,h3,span,div")) {
      const text = String(node.textContent || "").trim().toUpperCase();
      if (text === "ROBOT RGB" || text === "DEPTH") {
        titleNode = node;
        break;
      }
    }

    const header = titleNode?.parentElement || titleNode || reference;
    const candidates = [...reference.querySelectorAll("div,section")].filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width >= 100 && rect.height >= 60;
    });
    const body = candidates.sort(
      (a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height
    )[0] || reference;

    const parentWin = window.parent;
    const cardStyle = parentWin.getComputedStyle(reference);
    const headerStyle = parentWin.getComputedStyle(header);
    const bodyStyle = parentWin.getComputedStyle(body);
    const root = document.documentElement.style;

    const copy = (name, value) => {
      if (value && value !== "rgba(0, 0, 0, 0)" && value !== "transparent") {
        root.setProperty(name, value);
      }
    };

    copy("--fd21-live-camera-card-bg", cardStyle.backgroundColor);
    copy("--fd21-live-camera-card-border", cardStyle.borderTopColor);
    copy("--fd21-live-camera-card-radius", cardStyle.borderRadius);
    copy("--fd21-live-camera-header-bg", headerStyle.backgroundColor);
    copy("--fd21-live-camera-header-color", headerStyle.color);
    copy("--fd21-live-camera-header-font", headerStyle.fontFamily);
    copy("--fd21-live-camera-header-size", headerStyle.fontSize);
    copy("--fd21-live-camera-header-weight", headerStyle.fontWeight);
    copy("--fd21-live-camera-header-spacing", headerStyle.letterSpacing);
    copy("--fd21-live-camera-body-bg", bodyStyle.backgroundColor);
  }



  function fd22EnsureLiveStylesheet() {
    const parentDoc = fd21ParentDocument();
    if (!parentDoc) return;

    const href =
      [...parentDoc.querySelectorAll('link[rel="stylesheet"]')]
        .map((link) => link.href)
        .find((value) => value.includes("stitch_live_v12.css"));

    if (!href) return;
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((link) => link.href === href)) {
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.fd22LiveStyles = "1";
    document.head.appendChild(link);
  }

  function fd22StripIds(root) {
    if (!root) return;
    if (root.id) root.removeAttribute("id");
    for (const node of root.querySelectorAll("[id]")) node.removeAttribute("id");
  }


  function fd23LiveTile(parentDoc, id) {
    return parentDoc?.querySelector(
      `#view-live [data-camera-view-tile="${id}"]`
    ) || null;
  }

  function fd23InstallCameraIdleParity() {
    fd22EnsureLiveStylesheet();

    const parentDoc = fd21ParentDocument();
    if (!parentDoc) return;

    for (const [liveId, imageId] of [["rgb","camera-color"],["depth","camera-depth"]]) {
      const image = $(imageId);
      const card = image?.closest(".fd21-camera-card");
      const header = card?.querySelector(".fd21-camera-card-header");
      const body = card?.querySelector(".fd21-camera-card-body");
      if (!card || !header || !body) continue;

      const tile = fd23LiveTile(parentDoc, liveId);
      if (!tile) continue;

      const icon = tile.querySelector(".stitch-camera-title-icon-v147");
      const idle = tile.querySelector(".stitch-idle-reticle");

      if (icon && !header.querySelector(".fd23-live-title-icon")) {
        const clone = icon.cloneNode(true);
        fd22StripIds(clone);
        clone.classList.add("fd23-live-title-icon");
        header.insertBefore(clone, header.querySelector("strong"));
        header.querySelector(".fd21-camera-dot")?.remove();
      }

      if (idle && !body.querySelector(".fd23-live-idle")) {
        const clone = idle.cloneNode(true);
        fd22StripIds(clone);
        clone.classList.add("fd23-live-idle");
        body.insertBefore(clone, image);
      }
    }
  }





  function applyRequestedChanges() {
    setFirstBarColor();
    restoreCompositeSelects();
    splitCarSidebar();
    restoreCompositeSelects();
    placeFollowCarInTopbar();
    placeCarAlignInTopbar();
    placeRobotPreviewFirst();
    placePoseUnderViewTools();
    copyMappingPauseIcons();
    installTeleopSwitch();
    registerBusyProxies();
    installRunStateSync();
    installCarOnlineChip();
    installButtonStyleGuard();
    installPresentationGuard();
    installLivePanelDrag();
    installLivePanelResize();
    installPanelWidthObserver();
    synchronizePanelWidths();
    installRailScroll("left");
    installRailScroll("right");
    fd23InstallCameraIdleParity();
    installLateOwnerGuard();
  }

  function boot() {
    applyRequestedChanges();
    requestAnimationFrame(() => {
      applyRequestedChanges();
      synchronizePanelWidths();
    });
    [250, 1200].forEach(
      delay => window.setTimeout(() => {
        applyRequestedChanges();
        synchronizePanelWidths();
      }, delay)
    );
    window.addEventListener("resize", () => {
      placePoseUnderViewTools();
      synchronizePanelWidths();
      for (const owner of railScrollOwners.values()) owner.schedule();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
