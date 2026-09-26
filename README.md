
## Bundled current runtime dependencies

The repository also contains `runtime_dependencies/`, which preserves the custom Quest sender, exact active XR teleoperation code/assets, the exact g1demo Unitree SDK used by VR teleoperation, current RealSense helper, current modified Teleimager configuration, current modified Inspire service source/binary, robot map/config assets, and the live g1_ws local override snapshot.

Generated environments and machine secrets are intentionally excluded.

## Camera teleoperation

The Live tab's Camera teleoperation mode uses the camera pose teleop
**companion** running on the PC that views the dashboard (port 8088). The
bridge forwards `/api/camera-teleop/health`, `/status` and the three actions
to the IP the browser connected from, so "available" means "this PC has the
pipeline". Preview images are loaded by the browser straight from that PC
(`frames_origin` in the health answer), so they never cross the robot's
Wi-Fi. No Bacalbasa dashboard page is needed. The companion is part of
`camera_pose_teleop` (`dashboard_demo_v2/companion/`) and is installed once
per pipeline PC as a systemd user service. Actions require the trusted
dashboard session (`--enable-process-actions`, as `start_readonly_dashboard.sh`
starts it).

- The page loads in VR teleoperation. The PC is probed only while Camera
  teleoperation is selected.
- No companion (or not a pipeline PC): the main robot panel shows
  **CAMERA TELEOPERATION UNAVAILABLE**, and Configure and the Raw Camera,
  Simulation and Keypoints views are disabled.
- **Configure** calls the pipeline's physical `deploy` stage (cameras, V2
  tracking, MuJoCo validation, SONIC; no live robot control).
- **Enter Teleop** is enabled when `physical.ready_to_start` is true and calls
  the physical `start` stage.
- **Stop** is enabled while `physical.active` and calls the physical stop.
- Status rows (System, Simulation, SONIC, Camera, Alignment, Tracking) follow
  the pipeline dashboard's status semantics.
- Quiet robot network: Configure switches `unitree_slam` and `lidar_driver`
  off (their point clouds share the internal link and main board with SONIC's
  motor commands); Stop switches back on the ones that were on.
