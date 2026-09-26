# BACALBASA Full Dashboard — Current Snapshot

Snapshot generated: 2026-09-26T19:08:39+08:00

This repository snapshot preserves the current validated Full Dashboard system, including:

- current Full Dashboard source
- current bacalbasa_slam_runtime
- current SLAM / Nav2 configuration and maps
- current Quest / VR teleoperation integration
- current G1 V1.8 XR controller and required assets
- exact g1demo Unitree SDK used by the XR environment
- current RealSense camera helper
- current modified Teleimager configuration
- current Inspire service source and validated ARM64 binary
- current robot map and Mid360 configuration
- current g1_ws local source overrides

## SLAM tab changes in this snapshot

- Car Control sidebar: Mapping, Map & Localization (View / Download / Clear
  map, Load & Localize), Navigation (Preview, Start/Stop, Pause/Resume) and
  Manual Correction; CAR ONLINE / CAR OFFLINE chip; runtime WebSocket log.
- Car commands follow the standalone dashboard: no automatic map alignment,
  no automatic route intervention; Stop clears the previous car route.
- Align in the map toolbar; Follow robot / Follow car in 2D and 3D.
- Maps load only with View map (or Load & Localize), not on selection.
- Loading indicator on buttons whose command is still running, including the
  dashboard close button.
- Both sidebars scroll with the same indicator; unified button styles.

Generated runtime state, secrets, caches, backup history, ROS build/install/log output, and historical SLAM partial maps are intentionally excluded.

## Important validation hashes

```text
navigate_replanning.xml  1977a16a5be1258accd1059614b02e5b46db856f5a161859ec21e98eaece0bd3
```

See `runtime_dependencies/PROVENANCE.txt` and `FULL_SNAPSHOT_SHA256.txt` for additional provenance and file hashes.
