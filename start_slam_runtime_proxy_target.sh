#!/usr/bin/env bash
# Full Dashboard owner for the unchanged bacalbasa_slam_runtime engine.
#
# This intentionally mirrors bacalbasa_slam_runtime/start_dashboard.sh for the
# ROS 2/Nav2 and FastAPI processes, but does not start send_video_depth.py.
# The Full Dashboard remains the only owner of the physical RealSense device.

set -eo pipefail

RUNTIME_ROOT="${G1_SLAM_RUNTIME_ROOT:-/home/unitree/bacalbasa_slam_runtime}"
RUN_DIR="${G1_SLAM_RUNTIME_RUN_DIR:-/home/unitree/bacalbasa_dashboard_parallel_test_v1/run}"
DASHBOARD_PYTHON="${G1_DASHBOARD_PYTHON:-/usr/bin/python3}"
DASHBOARD_PORT="${ROBOTCAR_PORT:-3003}"
TOKEN_FILE="${G1_SLAM_RUNTIME_TOKEN_FILE:-$RUN_DIR/slam_runtime_token}"
LOCK_FILE="$RUN_DIR/slam_runtime.lock"

if [ ! -d "$RUNTIME_ROOT" ]; then
    echo "[ERROR] SLAM runtime is missing: $RUNTIME_ROOT"
    exit 1
fi
if ! [[ "$DASHBOARD_PORT" =~ ^[0-9]+$ ]] \
   || [ "$DASHBOARD_PORT" -lt 1024 ] \
   || [ "$DASHBOARD_PORT" -gt 65535 ]; then
    echo "[ERROR] ROBOTCAR_PORT must be between 1024 and 65535."
    exit 1
fi

mkdir -p "$RUN_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    echo "[ERROR] Full Dashboard SLAM runtime owner is already running."
    exit 1
fi

NAV2_PID=""
SERVER_PID=""
CLEANUP_STARTED=0

stop_managed_process() {
    local child_pid="$1"
    local signal_name="$2"
    [ -n "$child_pid" ] || return 0
    if kill -0 -- "-$child_pid" 2>/dev/null; then
        kill -"$signal_name" -- "-$child_pid" 2>/dev/null || true
        return 0
    fi
    kill -0 "$child_pid" 2>/dev/null || return 0
    kill -"$signal_name" "$child_pid" 2>/dev/null || true
}

stop_stack() {
    stop_managed_process "$SERVER_PID" TERM
    stop_managed_process "$NAV2_PID" TERM
    for _attempt in {1..30}; do
        any_running=0
        for child_pid in "$SERVER_PID" "$NAV2_PID"; do
            if [ -n "$child_pid" ] && kill -0 -- "-$child_pid" 2>/dev/null; then
                any_running=1
            fi
        done
        [ "$any_running" -eq 1 ] || break
        sleep 0.2
    done
    for child_pid in "$SERVER_PID" "$NAV2_PID"; do
        if [ -n "$child_pid" ] && kill -0 -- "-$child_pid" 2>/dev/null; then
            stop_managed_process "$child_pid" KILL
        fi
        [ -z "$child_pid" ] || wait "$child_pid" 2>/dev/null || true
    done
    NAV2_PID=""
    SERVER_PID=""
}

cleanup() {
    [ "$CLEANUP_STARTED" -eq 0 ] || return 0
    CLEANUP_STARTED=1
    trap - EXIT INT TERM HUP
    stop_stack
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

if [ ! -f /opt/ros/humble/setup.bash ]; then
    echo "[ERROR] ROS 2 Humble is not installed."
    exit 1
fi
source /opt/ros/humble/setup.bash

UNITREE_WS="/home/unitree/unitree_ros2/cyclonedds_ws"
if [ ! -f "$UNITREE_WS/install/setup.bash" ]; then
    echo "[ERROR] Unitree ROS 2 interfaces are missing from $UNITREE_WS."
    exit 1
fi
source "$UNITREE_WS/install/setup.bash"

export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
if [ -n "${G1_CYCLONEDDS_URI:-}" ]; then
    export CYCLONEDDS_URI="$G1_CYCLONEDDS_URI"
fi
export ROS_LOCALHOST_ONLY=0
export LD_LIBRARY_PATH="/opt/ros/humble/lib/aarch64-linux-gnu:/opt/ros/humble/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export G1_SKIP_SDK_INIT=1
export PYTHONPATH="$RUNTIME_ROOT/backend${PYTHONPATH:+:$PYTHONPATH}"

if ! "$DASHBOARD_PYTHON" -c \
  "import rclpy, fastapi, uvicorn; from nav2_msgs.action import NavigateToPose; from unitree_api.msg import Request" \
  >/dev/null 2>&1; then
    echo "[ERROR] Required ROS 2/Nav2/FastAPI Python modules are missing."
    exit 1
fi
for package in \
    nav2_bt_navigator nav2_controller nav2_planner nav2_collision_monitor \
    nav2_velocity_smoother pointcloud_to_laserscan teleop_twist_keyboard; do
    if ! ros2 pkg prefix "$package" >/dev/null 2>&1; then
        echo "[ERROR] Missing ROS 2 package: $package"
        exit 1
    fi
done
if [ ! -s "$TOKEN_FILE" ]; then
    (umask 077; "$DASHBOARD_PYTHON" -c \
      'import secrets; print(secrets.token_urlsafe(32))' > "$TOKEN_FILE")
fi
read -r G1_DASHBOARD_TOKEN < "$TOKEN_FILE"
if [ "${#G1_DASHBOARD_TOKEN}" -lt 16 ]; then
    echo "[ERROR] Invalid SLAM runtime token."
    exit 1
fi
export G1_DASHBOARD_TOKEN

# A previous Nav2 stack or backend stays visible for a few seconds after it
# exits (DDS discovery, socket teardown); wait for both to be released.
wait_until_released() {
    for _attempt in {1..30}; do
        if ! timeout 3 ros2 action list 2>/dev/null | grep -qx '/navigate_to_pose' \
           && ! { command -v ss >/dev/null 2>&1 \
                  && ss -H -ltn "sport = :$DASHBOARD_PORT" 2>/dev/null | grep -q .; }; then
            return 0
        fi
        sleep 2
    done
    echo "[ERROR] Another Nav2 stack owns /navigate_to_pose or port $DASHBOARD_PORT is occupied."
    return 1
}

start_stack() {
    cd "$RUNTIME_ROOT"
    setsid "$DASHBOARD_PYTHON" "$RUNTIME_ROOT/nav2/bringup.launch.py" 8>&- 9>&- &
    NAV2_PID=$!
    setsid "$DASHBOARD_PYTHON" -m uvicorn server:app \
        --app-dir "$RUNTIME_ROOT/backend" \
        --host 0.0.0.0 --port "$DASHBOARD_PORT" \
        --ws wsproto --no-access-log 8>&- 9>&- &
    SERVER_PID=$!

    for _attempt in {1..45}; do
        if ! kill -0 "$SERVER_PID" 2>/dev/null \
           || ! kill -0 "$NAV2_PID" 2>/dev/null; then
            echo "[ERROR] A SLAM runtime process stopped during startup."
            return 1
        fi
        if "$DASHBOARD_PYTHON" -c \
          'import json,sys,urllib.request; assert json.load(urllib.request.urlopen("http://127.0.0.1:"+sys.argv[1]+"/api/health/startup",timeout=1))["ready"]' \
          "$DASHBOARD_PORT" >/dev/null 2>&1; then
            echo "SLAM runtime ready on port $DASHBOARD_PORT (proxy uses loopback)."
            echo "Physical RealSense ownership remains with Full Dashboard."
            return 0
        fi
        sleep 1
    done
    echo "[ERROR] SLAM runtime backend did not become ready."
    return 1
}

# The runtime shuts its whole launch down when any Nav2 node dies (for example
# a smoother_server crash). Restart it idle, with robot control disabled, so
# the dashboard recovers; the operator must localize again before a route.
# A TERM/INT from the Full Dashboard exits through the traps without restart.
MAX_RESTARTS=5
RESTART_WINDOW_S=600
restart_times=()
while :; do
    wait_until_released || exit 1
    if start_stack; then
        set +e
        wait -n "$NAV2_PID" "$SERVER_PID"
        set -e
        echo "[ERROR] A managed SLAM runtime process stopped unexpectedly."
    fi
    stop_stack
    now=$(date +%s)
    recent=()
    for stamp in "${restart_times[@]}"; do
        [ $((now - stamp)) -lt "$RESTART_WINDOW_S" ] && recent+=("$stamp")
    done
    restart_times=("${recent[@]}" "$now")
    if [ "${#restart_times[@]}" -gt "$MAX_RESTARTS" ]; then
        echo "[ERROR] SLAM runtime failed ${#restart_times[@]} times in ${RESTART_WINDOW_S} s; not restarting."
        exit 1
    fi
    echo "Restarting SLAM runtime in 3 s (restart ${#restart_times[@]}/$MAX_RESTARTS)."
    sleep 3
done
