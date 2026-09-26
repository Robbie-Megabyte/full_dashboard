(() => {
  "use strict";

  const close =
    document.getElementById("fd-final-close");

  if (!close) return;

  let busy = false;

  // Loading indicator while the whole dashboard shuts down (can take seconds).
  const busyStyle = document.createElement("style");
  busyStyle.textContent = `
    #fd-final-close.fd-busy { position: relative; color: transparent !important; cursor: progress !important; }
    #fd-final-close.fd-busy::after {
      content: ""; position: absolute; top: 50%; left: 50%;
      width: 11px; height: 11px; margin: -7px 0 0 -7px;
      border: 1.5px solid rgb(245,158,11); border-right-color: transparent; border-radius: 50%;
      animation: fd-close-spin .7s linear infinite;
    }
    @keyframes fd-close-spin { to { transform: rotate(360deg); } }
  `;
  document.head.append(busyStyle);

  function showClosedScreen() {
    document.documentElement.innerHTML = `
      <head>
        <title>Full Dashboard stopped</title>
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1"
        >
        <style>
          html,body{
            margin:0;
            width:100%;
            height:100%;
            background:#080b0f;
            color:#d7e6ee;
            font-family:system-ui,sans-serif;
          }
          body{
            display:grid;
            place-items:center;
          }
          .fd-stopped{
            text-align:center;
          }
          .fd-stopped strong{
            display:block;
            font-size:20px;
            margin-bottom:8px;
          }
          .fd-stopped span{
            opacity:.65;
            font-size:13px;
          }
        </style>
      </head>
      <body>
        <div class="fd-stopped">
          <strong>FULL DASHBOARD STOPPED</strong>
          <span>Robot dashboard resources were released.</span>
        </div>
      </body>
    `;
  }

  close.addEventListener("click", async () => {
    if (busy) return;

    const request = new CustomEvent(
      "fd-dashboard-close-request",
      {
        bubbles: true,
        cancelable: true,
        detail: {
          action: "shutdown-dashboard",
          releaseRobotResources: true,
          source: "fd-final-close"
        }
      }
    );

    close.dispatchEvent(request);

    if (request.defaultPrevented) {
      return;
    }

    busy = true;
    close.disabled = true;
    close.classList.add("fd-busy");
    close.setAttribute(
      "aria-busy",
      "true"
    );

    try {
      const response = await fetch(
        "/api/session/shutdown",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: "{}",
          cache: "no-store"
        }
      );

      let result = {};

      try {
        result = await response.json();
      } catch (_) {}

      if (
        !response.ok
        ||
        result?.ok !== true
      ) {
        throw new Error(
          result?.error
          ||
          `shutdown failed (${response.status})`
        );
      }

      window.dispatchEvent(
        new CustomEvent(
          "fd-dashboard-shutdown",
          {
            detail: {
              releaseRobotResources: true,
              source: "fd-final-close",
              result
            }
          }
        )
      );

      showClosedScreen();

      try {
        window.close();
      } catch (_) {}

    } catch (error) {
      busy = false;
      close.disabled = false;
      close.classList.remove("fd-busy");
      close.removeAttribute(
        "aria-busy"
      );

      window.alert(
        "Full Dashboard shutdown failed.\n\n" +
        (
          error?.message
          ||
          String(error)
        ) +
        "\n\nThe dashboard was left running so the problem can be inspected."
      );
    }
  });
})();
