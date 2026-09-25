(() => {
  "use strict";

  const close =
    document.getElementById("fd-final-close");

  if (!close) return;

  let busy = false;

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
