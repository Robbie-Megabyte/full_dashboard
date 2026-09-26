#!/usr/bin/env bash

TARGET="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$TARGET/run"

G1XR_PY="$HOME/miniconda3/envs/g1_xr/bin/python"
SENDER="$HOME/g1_quest_fullbody_sender.py"

SLAM_STATE="/tmp/g1_dashboard_slam_$(id -u)"
SLAM_MAP="$HOME/g1_ws/map/harta_buna_2707.pcd"
SLAM_RUNTIME="$HOME/bacalbasa_slam_runtime"
SLAM_RUNTIME_TOKEN="$RUN/slam_runtime_token"

mkdir -p "$RUN"

echo
echo "============================================================"
echo " BACALBASA PARALLEL DASHBOARD — READ-ONLY START"
echo "============================================================"


echo
echo "----- SAFETY GUARDS -----"

SAFE=1

if grep -q \
    'BACALBASA PARALLEL READ-ONLY GUARD' \
    "$TARGET/g1_dashboard_process_manager.py"
then
    echo "PASS: controller autostart guard"
else
    echo "FAIL: controller autostart guard missing"
    SAFE=0
fi

if grep -q \
    'BACALBASA_PARALLEL_SLAM_READ_ONLY_GUARD' \
    "$TARGET/g1_dashboard_slam_worker.py"
then
    echo "PASS: SLAM Initial Pose guard"
else
    echo "FAIL: SLAM read-only guard missing"
    SAFE=0
fi


if [ "$SAFE" = "1" ]; then

    echo
    echo "----- SYSTEM MONITOR -----"

    OLD="$(cat "$RUN/monitor.pid" 2>/dev/null || true)"

    if [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null; then
        echo "already running PID $OLD"
    else
        nohup "$G1XR_PY" \
            "$TARGET/g1_dashboard_system_monitor.py" \
            --network-interface=enP8p1s0 \
            --unitree-services=on \
            --base-sensing=on \
            --udp-host=127.0.0.1 \
            --udp-port=8766 \
            --hz=4 \
            >"$RUN/monitor.log" 2>&1 &

        echo "$!" > "$RUN/monitor.pid"
        echo "started PID $!"
    fi


    echo
    echo "----- UNITREE SERVICE ACTION WORKER -----"
    # FULL_DASH_SERVICE_WORKER_OWNER_V1

    SERVICE_TOKEN_FILE="$RUN/service_token"
    SERVICE_SOCKET="$RUN/service_actions.sock"
    SERVICE_POLICY="$TARGET/service_policy.json"

    if [ ! -s "$SERVICE_TOKEN_FILE" ]; then
        umask 077
        /usr/bin/python3 -c \
          'import secrets; print(secrets.token_urlsafe(32))' \
          > "$SERVICE_TOKEN_FILE"
        chmod 600 "$SERVICE_TOKEN_FILE"
    fi

    SERVICE_TOKEN="$(
        tr -d '\r\n' < "$SERVICE_TOKEN_FILE"
    )"

    if [ "${#SERVICE_TOKEN}" -lt 16 ]; then
        echo "ERROR: invalid Full Dash service token"
        exit 1
    fi

    export G1_DASHBOARD_SERVICE_TOKEN="$SERVICE_TOKEN"
    export G1_DASHBOARD_SERVICE_SOCKET="$SERVICE_SOCKET"
    export G1_DASHBOARD_SERVICE_POLICY="$SERVICE_POLICY"

    SERVICE_PID="$(
        cat "$RUN/service.pid" 2>/dev/null || true
    )"

    SERVICE_RUNNING=0

    if [ -n "$SERVICE_PID" ] \
       && kill -0 "$SERVICE_PID" 2>/dev/null
    then
        SERVICE_CMD="$(
            tr '\0' ' ' \
              < "/proc/$SERVICE_PID/cmdline" \
              2>/dev/null || true
        )"

        case "$SERVICE_CMD" in
          *"$TARGET/g1_dashboard_service_worker.py"*)
            SERVICE_RUNNING=1
            echo "already running PID $SERVICE_PID"
            ;;
          *)
            echo "WARNING: stale service.pid did not match Full Dash worker"
            rm -f "$RUN/service.pid"
            ;;
        esac
    fi

    if [ "$SERVICE_RUNNING" = "0" ]; then
        rm -f "$SERVICE_SOCKET"

        nohup env \
            G1_DASHBOARD_SERVICE_TOKEN="$SERVICE_TOKEN" \
            "$G1XR_PY" \
            "$TARGET/g1_dashboard_service_worker.py" \
            --network-interface=enP8p1s0 \
            --socket="$SERVICE_SOCKET" \
            --policy="$SERVICE_POLICY" \
            >"$RUN/service.log" 2>&1 &

        SERVICE_PID="$!"
        echo "$SERVICE_PID" > "$RUN/service.pid"

        for _ in $(seq 1 40)
        do
            [ -S "$SERVICE_SOCKET" ] && break

            if ! kill -0 "$SERVICE_PID" 2>/dev/null; then
                break
            fi

            sleep 0.10
        done

        if [ ! -S "$SERVICE_SOCKET" ]; then
            echo "ERROR: Full Dash service worker did not become ready"
            tail -30 "$RUN/service.log" 2>/dev/null || true
            exit 1
        fi

        echo "started PID $SERVICE_PID"
    fi

    if [ ! -S "$SERVICE_SOCKET" ]; then
        echo "ERROR: Full Dash service socket is unavailable"
        exit 1
    fi


    echo
    echo "----- DEFAULT ROBOT SERVICES -----"
    # FULL_DASH_DEFAULT_SERVICES_ON_V1
    #
    # Intentional Full Dash startup policy:
    #     lidar_driver = ON
    #     unitree_slam = ON
    #
    # Requests still pass through the same explicit allowlist and
    # ServiceList post-verification used by the Inspect controls.

    PYTHONPATH="$TARGET" \
    G1_SERVICES_BEFORE_START="$RUN/services_before_start.json" \
    "$G1XR_PY" - <<'PY_SERVICE'
import json
import os
import time
from pathlib import Path

from g1_dashboard_service_client import ServiceActionClient

client = ServiceActionClient()

if not client.configured():
    raise SystemExit(
        "ERROR: service action client is not configured"
    )

# The dashboard close button restores these services to the state they had
# before the first Full Dash start; a restart keeps the original record.
record = Path(os.environ["G1_SERVICES_BEFORE_START"])
if not record.exists():
    listing = client.request("LIST_SERVICES")
    services = listing.get("services") or {}
    before = {
        name: (services.get(name) or {}).get("enabled")
        for name in ("lidar_driver", "unitree_slam")
    }
    if all(isinstance(value, bool) for value in before.values()):
        record.write_text(json.dumps(before) + "\n", encoding="utf-8")
        print(f"services before start: {before}")
    else:
        print(f"WARNING: could not record service states: {listing}")

for service in (
    "lidar_driver",
    "unitree_slam",
):
    last = None

    for attempt in range(1, 6):
        try:
            last = client.request(
                "SET_SERVICE",
                service=service,
                enabled=True,
            )
        except Exception as exc:
            last = {
                "status": "ERROR",
                "error": str(exc),
            }

        ok = (
            isinstance(last, dict)
            and last.get("status") == "COMPLETED"
            and last.get("verified") is True
        )

        if ok:
            print(
                f"{service}: ON verified "
                f"(attempt {attempt})"
            )
            break

        if attempt < 5:
            time.sleep(0.50)

    else:
        raise SystemExit(
            f"ERROR: could not verify {service}=ON: {last}"
        )
PY_SERVICE


    echo
    echo "----- DASHBOARD BRIDGE -----"

    OLD="$(cat "$RUN/bridge.pid" 2>/dev/null || true)"

    # A pre-integration bridge has the same command line, so verify the
    # advertised capability before deciding it can be reused.
    if [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null; then
        if ! /usr/bin/python3 -c \
          'import json,urllib.request; data=json.load(urllib.request.urlopen("http://127.0.0.1:8082/api/info",timeout=2)); assert data["safety_boundary"]["slam_runtime_proxy_endpoint"] == "/slam-runtime"' \
          >/dev/null 2>&1; then
            OLD_CMD="$(tr '\0' ' ' < "/proc/$OLD/cmdline" 2>/dev/null || true)"
            case "$OLD_CMD" in
              *"$TARGET/g1_dashboard_bridge.py"*)
                kill -TERM "$OLD" 2>/dev/null || true
                for _ in $(seq 1 50); do
                    kill -0 "$OLD" 2>/dev/null || break
                    sleep 0.10
                done
                if kill -0 "$OLD" 2>/dev/null; then
                    echo "ERROR: pre-integration bridge did not stop"
                    exit 1
                fi
                OLD=""
                rm -f "$RUN/bridge.pid"
                echo "stopped pre-integration bridge"
                ;;
              *)
                echo "ERROR: bridge.pid does not belong to Full Dashboard"
                exit 1
                ;;
            esac
        fi
    fi

    if [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null; then
        echo "already running PID $OLD"

    elif ss -lntp "sport = :8082" 2>/dev/null | grep -q LISTEN; then
        echo "WARNING: port 8082 already has a listener"
        ss -lntp "sport = :8082" 2>/dev/null || true

    else
        # FULL_DASH_ACTION_CAPABLE_START_V20_7
        ACTION_TOKEN_FILE="$RUN/action_token"

        if [ ! -s "$ACTION_TOKEN_FILE" ]; then
            umask 077
            /usr/bin/python3 -c \
              'import secrets; print(secrets.token_urlsafe(32))' \
              > "$ACTION_TOKEN_FILE"
            chmod 600 "$ACTION_TOKEN_FILE"
        fi

        ACTION_TOKEN="$(
            tr -d '\r\n' < "$ACTION_TOKEN_FILE"
        )"

        if [ "${#ACTION_TOKEN}" -lt 16 ]; then
            echo "ERROR: invalid Full Dash action token"
            exit 1
        fi

        nohup setsid env \
            G1_DASHBOARD_ACTION_TOKEN="$ACTION_TOKEN" \
            G1_DASHBOARD_SERVICE_TOKEN="$SERVICE_TOKEN" \
            G1_DASHBOARD_SERVICE_SOCKET="$SERVICE_SOCKET" \
            G1_DASHBOARD_SERVICE_POLICY="$SERVICE_POLICY" \
            G1_QUEST_TELEMETRY_IP="192.168.0.183" \
            G1_QUEST_TELEMETRY_PORT="5055" \
            G1_QUEST_TELEMETRY_INTERFACE="enP8p1s0" \
            G1_QUEST_TELEMETRY_HZ="30" \
            G1_DASHBOARD_WEB_DERIVED_FPS="30" \
            G1_UNITY_TELEVUER_MOTION_ENABLED="1" \
            G1_UNITY_TELEVUER_STABLE_FRAMES="4" \
            G1_UNITY_TELEVUER_STALE_TIMEOUT_S="0.50" \
            FULL_DASH_DRAGOS_QUEST_PARITY_V21_2="1" \
            G1_DASHBOARD_CONTROLLER_STATE="$RUN/controller.json" \
            G1_DASHBOARD_CONTROLLER_LOG="$RUN/controller.log" \
            G1_DASHBOARD_CAMERA_STATE="$RUN/camera.json" \
            G1_DASHBOARD_FULLBODY_STATE="$RUN/fullbody.json" \
            G1_DASHBOARD_INSPIRE_HELPER="/usr/local/libexec/g1-dashboard/g1_dashboard_inspire_helper.py" \
            G1_DASHBOARD_CONTROLLER_SCRIPT="$HOME/xr_teleoperate_g1demo/teleop/g1_locomotion_xr_handover_live_v6_7_4_symmetric_thumb_control_dashboard_telemetry_v1_8.py" \
            G1_DASHBOARD_CONTROLLER_PYTHON="$HOME/miniconda3/envs/g1_xr/bin/python" \
            G1_DASHBOARD_SLAM_STATE_DIR="$SLAM_STATE" \
            G1_DASHBOARD_SLAM_MAP="$SLAM_MAP" \
            G1_SLAM_RUNTIME_HOST="127.0.0.1" \
            G1_SLAM_RUNTIME_PORT="3003" \
            G1_SLAM_RUNTIME_TOKEN_FILE="$SLAM_RUNTIME_TOKEN" \
            /usr/bin/python3 \
            "$TARGET/g1_dashboard_bridge.py" \
            --udp-host=127.0.0.1 \
            --udp-port=8765 \
            --system-udp-port=8766 \
            --robot-udp-port=8768 \
            --http-host=0.0.0.0 \
            --http-port=8082 \
            --enable-process-actions \
            --enable-service-actions \
            >"$RUN/bridge.log" 2>&1 &

        echo "$!" > "$RUN/bridge.pid"
        echo "started PID $!"
    fi


    echo
    echo "----- PASSIVE LOWSTATE STREAM -----"
    echo "FULL_DASH_PROCESS_MANAGER_OWNED_SENDER_V20_7"
    echo "sender lifecycle is owned by Full Dash persistent browser stream"

    echo "----- SLAM RUNTIME (ROS 2 / NAV2) -----"

    # Retire only the exact legacy passive observer previously owned by this
    # dashboard. It must not run beside the authoritative runtime engine.
    OLD_PASSIVE="$(cat "$RUN/slam.pid" 2>/dev/null || true)"
    if [ -n "$OLD_PASSIVE" ] && kill -0 "$OLD_PASSIVE" 2>/dev/null; then
        PASSIVE_CMD="$(tr '\0' ' ' < "/proc/$OLD_PASSIVE/cmdline" 2>/dev/null || true)"
        case "$PASSIVE_CMD" in
          *"$TARGET/g1_dashboard_slam_worker.py"*)
            kill -TERM "$OLD_PASSIVE" 2>/dev/null || true
            for _ in $(seq 1 30); do
                kill -0 "$OLD_PASSIVE" 2>/dev/null || break
                sleep 0.10
            done
            echo "stopped legacy passive SLAM observer PID $OLD_PASSIVE"
            ;;
          *)
            echo "WARNING: slam.pid does not belong to the legacy passive observer"
            ;;
        esac
    fi
    rm -f "$RUN/slam.pid"

    SLAM_RUNTIME_PID="$(cat "$RUN/slam_runtime.pid" 2>/dev/null || true)"
    SLAM_RUNTIME_RUNNING=0
    if [ -n "$SLAM_RUNTIME_PID" ] && kill -0 "$SLAM_RUNTIME_PID" 2>/dev/null; then
        SLAM_RUNTIME_CMD="$(tr '\0' ' ' < "/proc/$SLAM_RUNTIME_PID/cmdline" 2>/dev/null || true)"
        case "$SLAM_RUNTIME_CMD" in
          *"$TARGET/start_slam_runtime_proxy_target.sh"*)
            SLAM_RUNTIME_RUNNING=1
            echo "already running PID $SLAM_RUNTIME_PID"
            ;;
          *)
            echo "WARNING: stale slam_runtime.pid did not match the Full Dashboard owner"
            rm -f "$RUN/slam_runtime.pid"
            ;;
        esac
    fi

    if [ "$SLAM_RUNTIME_RUNNING" = "0" ]; then
        nohup setsid env \
            G1_SLAM_RUNTIME_ROOT="$SLAM_RUNTIME" \
            G1_SLAM_RUNTIME_RUN_DIR="$RUN" \
            G1_SLAM_RUNTIME_TOKEN_FILE="$SLAM_RUNTIME_TOKEN" \
            G1_CYCLONEDDS_URI="$TARGET/config/cyclonedds_slam.xml" \
            G1_DASHBOARD_PYTHON="/usr/bin/python3" \
            ROBOTCAR_PORT="3003" \
            "$TARGET/start_slam_runtime_proxy_target.sh" \
            >"$RUN/slam_runtime.log" 2>&1 &

        SLAM_RUNTIME_PID="$!"
        echo "$SLAM_RUNTIME_PID" > "$RUN/slam_runtime.pid"
        echo "started PID $SLAM_RUNTIME_PID"
    fi

    SLAM_RUNTIME_READY=0
    for _ in $(seq 1 50); do
        if /usr/bin/python3 -c \
          'import json,urllib.request; assert json.load(urllib.request.urlopen("http://127.0.0.1:3003/api/health/startup",timeout=1))["ready"]' \
          >/dev/null 2>&1; then
            SLAM_RUNTIME_READY=1
            break
        fi
        if ! kill -0 "$SLAM_RUNTIME_PID" 2>/dev/null; then
            break
        fi
        sleep 1
    done
    if [ "$SLAM_RUNTIME_READY" != "1" ]; then
        echo "ERROR: SLAM runtime did not become ready"
        tail -60 "$RUN/slam_runtime.log" 2>/dev/null || true
        exit 1
    fi


    echo
    echo "----- WAIT FOR DATA -----"
    sleep 5


    echo
    echo "----- STATUS -----"

    for NAME in monitor service bridge robot_sender slam_runtime
    do
        PID="$(cat "$RUN/$NAME.pid" 2>/dev/null || true)"

        printf "%-14s " "$NAME"

        if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
            echo "RUNNING PID $PID"
        else
            echo "NOT RUNNING"
        fi
    done


    echo
    echo "----- API QUICK CHECK -----"

    /usr/bin/python3 - <<'PY'
import json
from urllib.request import urlopen

BASE = "http://127.0.0.1:8082"

def get(path):
    with urlopen(BASE + path, timeout=5) as r:
        return json.loads(r.read())

try:
    latest = get("/api/latest")
    bridge = latest.get("bridge", {})

    print(
        "robot_online:",
        bridge.get("robot_online")
    )
    print(
        "robot_packets:",
        bridge.get("robot_packet_count")
    )
    print(
        "robot_invalid:",
        bridge.get("robot_invalid_count")
    )

    system = get("/api/system")
    s = system.get("system", {})

    print(
        "system_monitor:",
        system.get("monitor", {}).get("online")
    )
    print(
        "services:",
        s.get("robot_state_api", {}).get("available")
    )
    print(
        "imu:",
        s.get("base_sensing", {})
         .get("imu", {})
         .get("available")
    )
    print(
        "odometry:",
        s.get("base_sensing", {})
         .get("odometry", {})
         .get("available")
    )

    slam_health = get("/slam-runtime/api/health/startup")
    slam = get("/slam-runtime/api/status")
    slam_maps = get("/slam-runtime/api/maps")

    print("slam_runtime_ready:", slam_health.get("ready"))
    print("slam_mode:", slam.get("mode"))
    print("slam_lidar_age:", slam.get("lidar_age"))
    print("slam_odom_age:", slam.get("base_odom_age"))
    print("slam_maps:", len(slam_maps.get("maps") or []))

except Exception as exc:
    print("API ERROR:", repr(exc))
PY


    echo
    echo "============================================================"
    echo " DASHBOARD:"
    echo " http://192.168.0.116:8082/"
    echo "============================================================"

else

    echo
    echo "NOT STARTED."
    echo "One of the read-only safety guards is missing."

fi
