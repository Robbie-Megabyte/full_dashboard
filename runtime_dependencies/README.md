# Bundled Runtime Dependencies

This directory preserves project-owned/customized runtime pieces used by the validated BACALBASA Full Dashboard deployment.

It does not contain Conda environments, /opt/ros, generated ROS build/install/log directories, passwords, TLS private keys, session tokens, or the entire robot workspace.

## quest/
Contains the current g1_quest_fullbody_sender.py used by the Full Dashboard.

## xr_teleop/
Contains the exact active V1.8 G1 controller, its local Python dependency closure, Televuer source without machine TLS keys/certificates, dex-retargeting source, the G1 and Inspire assets required by the current configuration, and the validated G1 model cache.

## unitree_sdk2_python_g1demo/
Contains the exact SDK tree resolved by the validated g1_xr environment. This differs from the normal unitree_sdk2_python checkout in G1 locomotion code and must not be silently replaced.

## camera/
Contains the current custom send_video_depth.py RealSense helper used by the dashboard camera lifecycle.

## teleimager/
Contains the current Teleimager checkout contents, including the locally modified cam_config_server.yaml, but without Git metadata or local backup files.

## inspire_service/
Contains the current locally modified Inspire service source plus the exact validated ARM64 inspire_g1 executable used on the robot.

## robot_assets/
Contains the active harta_buna_2707.pcd map and Mid360 robot configuration.

## g1_ws_overrides/
The live robot sources /home/unitree/g1_ws/install/setup.bash. The complete ROS workspace is intentionally not duplicated here because it includes large generated/unrelated assets. This directory captures the current locally modified tracked files, a Git patch, and workspace provenance.

The base ROS 2 Humble / Unitree workspace remains a platform dependency.

## Secrets deliberately excluded

- Televuer key.pem
- Televuer cert.pem
- unity_televuer.key
- dashboard runtime tokens
- session cookies
- private keys and .env files
