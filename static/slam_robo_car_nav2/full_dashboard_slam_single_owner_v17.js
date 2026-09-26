/* SLAM V17 CONSOLIDATED HISTORICAL SNAPSHOT — JS */

/* ===== BEGIN full_dashboard_live_match_v4.js ===== */
/* ============================================================
   FULL_DASH_SLAM_LIVE_MATCH_JS_V4

   Presentation only.

   Because this SLAM frontend is served in a same-origin iframe,
   use the ACTUAL Full Dashboard Live styles rather than guessed
   copies.

   No robot/API/event functionality is touched.
   ============================================================ */

(() => {
    "use strict";

    const root =
        document.documentElement;


    function exactTextElement(
        doc,
        wanted
    ) {

        const target =
            String(wanted)
                .trim()
                .toUpperCase();


        for (
            const node
            of doc.querySelectorAll(
                "strong,h1,h2,h3,h4,span,div"
            )
        ) {

            if (
                String(
                    node.textContent
                    ||
                    ""
                )
                .trim()
                .toUpperCase()
                ===
                target
            ) {
                return node;
            }
        }


        return null;
    }


    function nearestPanel(
        node
    ) {

        if (!node) {
            return null;
        }


        return (
            node.closest(
                ".panel,"
                +
                ".rail-panel,"
                +
                ".teleoperation-panel-v16,"
                +
                ".status-panel,"
                +
                "section"
            )
            ||
            node.parentElement
            ||
            null
        );
    }


    function setVar(
        name,
        value
    ) {

        if (
            value
            &&
            value !== "rgba(0, 0, 0, 0)"
            &&
            value !== "transparent"
        ) {

            root.style.setProperty(
                name,
                value
            );
        }
    }


    function copyLiveStylesV4() {

        let parentDoc;


        try {

            parentDoc =
                window.parent.document;
        }

        catch (_) {

            return;
        }


        if (
            !parentDoc
            ||
            parentDoc === document
        ) {
            return;
        }


        /*
         * ----------------------------------------------------
         * LIVE SIDEBAR
         * ----------------------------------------------------
         */

        const liveRail =
            parentDoc.querySelector(
                "#view-live .combined-rail"
            );


        if (liveRail) {

            const style =
                window.parent
                    .getComputedStyle(
                        liveRail
                    );


            setVar(
                "--fd4-live-sidebar-bg",
                style.backgroundColor
            );


            setVar(
                "--fd4-live-sidebar-border",
                style.borderColor
            );
        }


        /*
         * ----------------------------------------------------
         * LIVE STATUS PANEL = subsection reference
         * ----------------------------------------------------
         */

        const statusTitle =
            exactTextElement(
                parentDoc,
                "STATUS"
            );


        const statusPanel =
            nearestPanel(
                statusTitle
            );


        if (statusPanel) {

            const style =
                window.parent
                    .getComputedStyle(
                        statusPanel
                    );


            setVar(
                "--fd4-live-panel-bg",
                style.backgroundColor
            );


            setVar(
                "--fd4-live-panel-border",
                style.borderTopColor
            );


            setVar(
                "--fd4-live-panel-radius",
                style.borderRadius
            );
        }


        /*
         * ----------------------------------------------------
         * TELEOPERATION title = exact heading reference
         * ----------------------------------------------------
         */

        const teleopTitle =
            exactTextElement(
                parentDoc,
                "TELEOPERATION"
            );


        if (teleopTitle) {

            const titleStyle =
                window.parent
                    .getComputedStyle(
                        teleopTitle
                    );


            setVar(
                "--fd4-title-font-family",
                titleStyle.fontFamily
            );


            setVar(
                "--fd4-title-font-size",
                titleStyle.fontSize
            );


            setVar(
                "--fd4-title-font-weight",
                titleStyle.fontWeight
            );


            setVar(
                "--fd4-title-letter-spacing",
                titleStyle.letterSpacing
            );


            setVar(
                "--fd4-title-color",
                titleStyle.color
            );


            setVar(
                "--fd4-title-line-height",
                titleStyle.lineHeight
            );


            const titleParent =
                teleopTitle.parentElement;


            if (titleParent) {

                const parentStyle =
                    window.parent
                        .getComputedStyle(
                            titleParent
                        );


                setVar(
                    "--fd4-title-pad-top",
                    parentStyle.paddingTop
                );


                setVar(
                    "--fd4-title-pad-right",
                    parentStyle.paddingRight
                );


                setVar(
                    "--fd4-title-pad-bottom",
                    parentStyle.paddingBottom
                );


                setVar(
                    "--fd4-title-pad-left",
                    parentStyle.paddingLeft
                );
            }
        }
    }


    function bootV4() {

        copyLiveStylesV4();


        window.setTimeout(
            copyLiveStylesV4,
            100
        );


        window.setTimeout(
            copyLiveStylesV4,
            600
        );
    }


    if (
        document.readyState
        ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            bootV4,
            {
                once: true,
            }
        );
    }

    else {

        bootV4();
    }

})();

/* ===== END full_dashboard_live_match_v4.js ===== */

/* ===== BEGIN full_dashboard_motion_v5.js ===== */
/* ============================================================
   FULL_DASH_SLAM_MOTION_JS_V5

   Presentation / layout only.

   Major-panel behavior mirrors the established Live concept:
     - drag the REAL section
     - no drag clone
     - widths belong to section identity
     - reorder while pointer crosses slots
     - stationary sections FLIP to new locations
     - 290 ms settle
     - persisted section order

   Mapping controls reuse the EXISTING buttons/listeners.
   ============================================================ */

(() => {
    "use strict";


    const STORAGE_KEY =
        "full-dash-slam-major-order-v5";


    const FLIP_MS =
        290;


    const FLIP_EASING =
        "cubic-bezier(0.2, 0.85, 0.25, 1)";


    let shell =
        null;


    let drag =
        null;


    let pauseObserver =
        null;


    const sectionByKey =
        new Map();


    /* ========================================================
       BASIC HELPERS
       ======================================================== */


    function setVar(
        name,
        value
    ) {

        if (
            value
            &&
            value !==
                "normal"
            &&
            value !==
                "auto"
        ) {

            document
                .documentElement
                .style
                .setProperty(
                    name,
                    value
                );
        }
    }


    function majorSections() {

        if (!shell) {
            return [];
        }


        return [
            ...shell.children
        ]
        .filter(
            node =>
                node.dataset
                    .fdSlamMajorKeyV5
        );
    }


    function currentOrder() {

        return majorSections()
            .map(
                node =>
                    node.dataset
                        .fdSlamMajorKeyV5
            );
    }


    function sameOrder(
        a,
        b
    ) {

        return (
            a.length === b.length
            &&
            a.every(
                (
                    value,
                    index
                ) =>
                    value
                    ===
                    b[index]
            )
        );
    }


    function validOrder(
        value
    ) {

        return (
            Array.isArray(value)
            &&
            value.length === 3
            &&
            [
                ...value
            ]
            .sort()
            .join("|")
            ===
            [
                "car",
                "map",
                "robot",
            ]
            .sort()
            .join("|")
        );
    }


    /* ========================================================
       EXACT LIVE REFERENCES
       ======================================================== */


    function parentDocument() {

        try {

            if (
                window.parent
                &&
                window.parent
                    !== window
            ) {

                return (
                    window.parent
                        .document
                );
            }

        }

        catch (_) {
        }


        return null;
    }


    function copyTitleReference(
        source,
        prefix
    ) {

        if (!source) {
            return;
        }


        const style =
            window.parent
                .getComputedStyle(
                    source
                );


        setVar(
            `--${prefix}-font`,
            style.fontFamily
        );


        setVar(
            `--${prefix}-size`,
            style.fontSize
        );


        setVar(
            `--${prefix}-weight`,
            style.fontWeight
        );


        setVar(
            `--${prefix}-spacing`,
            style.letterSpacing
        );


        setVar(
            `--${prefix}-color`,
            style.color
        );
    }


    function copyLiveHandleStyle() {

        const doc =
            parentDocument();


        if (!doc) {
            return;
        }


        const reference =
            doc.querySelector(
                '#view-live '
                +
                '[aria-label^="Drag "]'
                +
                '[aria-label$=" section"]'
            )
            ||
            doc.querySelector(
                "#view-live "
                +
                ".stitch-major-handle-v1924"
            );


        if (!reference) {
            return;
        }


        const style =
            window.parent
                .getComputedStyle(
                    reference
                );


        const props = [
            "width",
            "height",
            "background",
            "backgroundColor",
            "backgroundImage",
            "border",
            "borderTopColor",
            "borderRightColor",
            "borderBottomColor",
            "borderLeftColor",
            "borderRadius",
            "boxShadow",
            "opacity",
        ];


        document
            .querySelectorAll(
                ".fd-slam-major-handle-v5"
            )
            .forEach(
                handle => {

                    for (
                        const prop
                        of props
                    ) {

                        const value =
                            style[prop];


                        if (
                            !value
                            ||
                            value ===
                                "none"
                        ) {
                            continue;
                        }


                        const cssName =
                            prop.replace(
                                /[A-Z]/g,
                                char =>
                                    "-"
                                    +
                                    char
                                        .toLowerCase()
                            );


                        handle.style
                            .setProperty(
                                cssName,
                                value,
                                "important"
                            );
                    }
                }
            );
    }


    function copyLiveControllerGeometry() {

        const doc =
            parentDocument();


        if (!doc) {
            return;
        }


        const configure =
            doc.getElementById(
                "controllerConfigureBtn"
            );


        const stop =
            doc.getElementById(
                "controllerStopBtn"
            );


        const teleopTitle =
            doc.querySelector(
                "#teleoperationPanelV16 "
                +
                ".teleoperation-head-v16 "
                +
                "strong"
            )
            ||
            doc.querySelector(
                "#teleoperationPanelV16 strong"
            );


        const majorTitle =
            doc.getElementById(
                "cameraMultiviewTitle"
            );


        copyTitleReference(
            majorTitle,
            "fd5-major"
        );


        copyTitleReference(
            teleopTitle,
            "fd5-card"
        );


        if (
            configure
        ) {

            const style =
                window.parent
                    .getComputedStyle(
                        configure
                    );


            setVar(
                "--fd5-controller-height",
                style.height
            );


            setVar(
                "--fd5-controller-radius",
                style.borderRadius
            );


            setVar(
                "--fd5-controller-font-size",
                style.fontSize
            );


            setVar(
                "--fd5-controller-font-weight",
                style.fontWeight
            );


            setVar(
                "--fd5-controller-spacing",
                style.letterSpacing
            );
        }


        const pair =
            configure
            ?.closest(
                ".baca-segmented-switch-v16"
            );


        if (pair) {

            const style =
                window.parent
                    .getComputedStyle(
                        pair
                    );


            setVar(
                "--fd5-controller-border",
                style.borderTopColor
            );
        }


        /*
         * Stop reference is intentionally touched too so this
         * function verifies both original Live controls exist.
         */

        if (!stop) {

            console.warn(
                "[SLAM V5] "
                +
                "Live Stop reference not found."
            );
        }


        copyLiveHandleStyle();
    }


    /* ========================================================
       MAPPING CONTROL PRESENTATION
       ======================================================== */


    function buttonText(
        button
    ) {

        return String(
            button?.textContent
            ||
            ""
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
    }


    function setStableButtonMarkup(
        button,
        icon,
        label
    ) {

        if (!button) {
            return;
        }


        const wanted =
            `${icon}${label}`;


        const current =
            buttonText(
                button
            )
            .replace(
                /\s+/g,
                ""
            );


        if (
            current
            ===
            wanted
                .replace(
                    /\s+/g,
                    ""
                )
        ) {
            return;
        }


        button.replaceChildren();


        const iconNode =
            document.createElement(
                "span"
            );


        iconNode.className =
            "fd-map-action-icon-v5";


        iconNode.setAttribute(
            "aria-hidden",
            "true"
        );


        iconNode.textContent =
            icon;


        const labelNode =
            document.createElement(
                "span"
            );


        labelNode.textContent =
            label;


        button.append(
            iconNode,
            labelNode
        );
    }


    function syncMappingButtonPresentation() {

        const start =
            document.getElementById(
                "start-map"
            );


        const pause =
            document.getElementById(
                "pause-map"
            );


        const stop =
            document.getElementById(
                "stop-map"
            );


        const startText =
            buttonText(
                start
            );


        const pauseText =
            buttonText(
                pause
            );


        const stopText =
            buttonText(
                stop
            );


        /*
         * Only normalize STABLE labels.
         *
         * Busy/status labels from the original functional JS are
         * deliberately left alone.
         */

        if (
            /start mapping/i
                .test(
                    startText
                )
        ) {

            setStableButtonMarkup(
                start,
                "◇",
                "Start mapping"
            );
        }


        if (
            /^([■×]\s*)?stop$/i
                .test(
                    stopText
                )
        ) {

            setStableButtonMarkup(
                stop,
                "×",
                "Stop"
            );
        }


        if (
            /resume/i
                .test(
                    pauseText
                )
        ) {

            pause.classList
                .remove(
                    "fd-map-pause-v5"
                );


            pause.classList
                .add(
                    "fd-map-resume-v5"
                );


            setStableButtonMarkup(
                pause,
                "◇",
                "Resume"
            );
        }

        else if (
            /pause/i
                .test(
                    pauseText
                )
        ) {

            pause.classList
                .remove(
                    "fd-map-resume-v5"
                );


            pause.classList
                .add(
                    "fd-map-pause-v5"
                );


            setStableButtonMarkup(
                pause,
                "Ⅱ",
                "Pause"
            );
        }
    }


    function installMappingController() {

        const start =
            document.getElementById(
                "start-map"
            );


        const pause =
            document.getElementById(
                "pause-map"
            );


        const stop =
            document.getElementById(
                "stop-map"
            );


        if (
            !start
            ||
            !pause
            ||
            !stop
        ) {
            return;
        }


        if (
            document.querySelector(
                ".fd-map-controller-v5"
            )
        ) {

            syncMappingButtonPresentation();

            return;
        }


        const body =
            start.closest(
                ".card-body"
            );


        if (!body) {
            return;
        }


        const oldMappingActions =
            pause.closest(
                ".mapping-actions"
            );


        const host =
            document.createElement(
                "div"
            );


        host.className =
            "fd-map-controller-v5";


        const primary =
            document.createElement(
                "div"
            );


        primary.className =
            "fd-map-primary-row-v5";


        const secondary =
            document.createElement(
                "div"
            );


        secondary.className =
            "fd-map-secondary-row-v5";


        body.insertBefore(
            host,
            start
        );


        primary.append(
            start,
            stop
        );


        secondary.append(
            pause
        );


        host.append(
            primary,
            secondary
        );


        oldMappingActions
            ?.classList
            .add(
                "fd-map-actions-retired-v5"
            );


        syncMappingButtonPresentation();


        /*
         * Targeted observer ONLY for the Pause/Resume action
         * label owned by the original functional app.js.
         *
         * No layout observation.
         * No polling.
         */

        pauseObserver =
            new MutationObserver(
                syncMappingButtonPresentation
            );


        pauseObserver.observe(
            pause,
            {
                childList:
                    true,

                characterData:
                    true,

                subtree:
                    true,
            }
        );


        /*
         * Also normalize Start/Stop again after original action()
         * restores their stable labels.
         */

        for (
            const button
            of [
                start,
                stop,
            ]
        ) {

            new MutationObserver(
                syncMappingButtonPresentation
            )
            .observe(
                button,
                {
                    childList:
                        true,

                    characterData:
                        true,

                    subtree:
                        true,
                }
            );
        }
    }


    /* ========================================================
       MAJOR PANEL DRAG / REORDER
       ======================================================== */


    function installMajorIdentity() {

        shell =
            document.querySelector(
                ".app-shell"
            );


        if (!shell) {
            return false;
        }


        const robot =
            shell.querySelector(
                ":scope > "
                +
                ".control-panel"
                +
                ":not(.car-side)"
            );


        const map =
            shell.querySelector(
                ":scope > "
                +
                ".workspace"
            );


        const car =
            shell.querySelector(
                ":scope > "
                +
                ".control-panel"
                +
                ".car-side"
            );


        if (
            !robot
            ||
            !map
            ||
            !car
        ) {
            return false;
        }


        const defs = [
            [
                "robot",
                robot,
                "Robot navigation",
            ],
            [
                "map",
                map,
                "Map workspace",
            ],
            [
                "car",
                car,
                "Car navigation",
            ],
        ];


        for (
            const [
                key,
                node,
                label,
            ]
            of defs
        ) {

            node.dataset
                .fdSlamMajorKeyV5 =
                    key;


            sectionByKey.set(
                key,
                node
            );


            if (
                !node.querySelector(
                    ":scope > "
                    +
                    ".fd-slam-major-handle-v5"
                )
            ) {

                const handle =
                    document.createElement(
                        "button"
                    );


                handle.type =
                    "button";


                handle.className =
                    "fd-slam-major-handle-v5";


                handle.setAttribute(
                    "aria-label",
                    `Drag ${label} section`
                );


                handle.title =
                    `Drag ${label} section`;


                handle.addEventListener(
                    "pointerdown",
                    event =>
                        beginMajorDrag(
                            event,
                            key,
                            node,
                            handle
                        )
                );


                handle.addEventListener(
                    "keydown",
                    event =>
                        keyboardMove(
                            event,
                            key
                        )
                );


                node.appendChild(
                    handle
                );
            }
        }


        return true;
    }


    function visualGap() {

        if (!shell) {
            return 0;
        }


        const style =
            getComputedStyle(
                shell
            );


        return (
            parseFloat(
                style.columnGap
                ||
                style.gap
                ||
                "0"
            )
            ||
            0
        );
    }


    function widthsByKey() {

        const widths = {};


        for (
            const [
                key,
                node
            ]
            of sectionByKey
        ) {

            widths[key] =
                node
                    .getBoundingClientRect()
                    .width;
        }


        return widths;
    }


    function applyWidths(
        order,
        widths
    ) {

        if (!shell) {
            return;
        }


        const template =
            order
                .map(
                    key =>
                        `${Math.max(
                            1,
                            Math.round(
                                widths[key]
                            )
                        )}px`
                )
                .join(" ");


        shell.style
            .setProperty(
                "grid-template-columns",
                template,
                "important"
            );
    }


    function captureRects() {

        const result =
            new Map();


        for (
            const node
            of majorSections()
        ) {

            result.set(
                node,
                node
                    .getBoundingClientRect()
            );
        }


        return result;
    }


    function animateFlip(
        before,
        exclude = null
    ) {

        for (
            const [
                node,
                oldRect
            ]
            of before
        ) {

            if (
                node ===
                    exclude
                ||
                !node.isConnected
            ) {
                continue;
            }


            const rect =
                node
                    .getBoundingClientRect();


            const dx =
                oldRect.left
                -
                rect.left;


            const dy =
                oldRect.top
                -
                rect.top;


            if (
                Math.abs(
                    dx
                )
                <
                1
                &&
                Math.abs(
                    dy
                )
                <
                1
            ) {
                continue;
            }


            try {

                node.animate(
                    [
                        {
                            transform:
                                `translate3d(${dx}px, ${dy}px, 0) scale(.985)`,
                        },
                        {
                            transform:
                                "translate3d(0,0,0) scale(1)",
                        },
                    ],
                    {
                        duration:
                            FLIP_MS,

                        easing:
                            FLIP_EASING,

                        fill:
                            "both",
                    }
                );

            }

            catch (_) {
            }
        }
    }


    function appendInOrder(
        order
    ) {

        for (
            const key
            of order
        ) {

            const node =
                sectionByKey.get(
                    key
                );


            if (node) {

                shell.appendChild(
                    node
                );
            }
        }
    }


    function saveOrder() {

        try {

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(
                    currentOrder()
                )
            );

        }

        catch (_) {
        }
    }


    function restoreOrder() {

        let saved = null;


        try {

            saved =
                JSON.parse(
                    localStorage.getItem(
                        STORAGE_KEY
                    )
                );

        }

        catch (_) {
        }


        if (
            !validOrder(
                saved
            )
        ) {
            return;
        }


        const before =
            captureRects();


        appendInOrder(
            saved
        );


        animateFlip(
            before
        );
    }


    function desiredOrderAtX(
        key,
        clientX
    ) {

        const others =
            currentOrder()
                .filter(
                    value =>
                        value !== key
                );


        let index = 0;


        for (
            const otherKey
            of others
        ) {

            const node =
                sectionByKey.get(
                    otherKey
                );


            const rect =
                node
                    .getBoundingClientRect();


            const center =
                rect.left
                +
                rect.width
                /
                2;


            if (
                clientX
                >
                center
            ) {

                index += 1;
            }
        }


        const result =
            [
                ...others
            ];


        result.splice(
            index,
            0,
            key
        );


        return result;
    }


    function reorderDuringDrag(
        event,
        wanted
    ) {

        if (
            !drag
            ||
            sameOrder(
                wanted,
                drag.currentOrder
            )
        ) {
            return;
        }


        const before =
            captureRects();


        const visualRect =
            drag.node
                .getBoundingClientRect();


        drag.node.style
            .removeProperty(
                "transform"
            );


        appendInOrder(
            wanted
        );


        applyWidths(
            wanted,
            drag.widths
        );


        const baseRect =
            drag.node
                .getBoundingClientRect();


        drag.baseLeft =
            baseRect.left;


        drag.dx =
            visualRect.left
            -
            baseRect.left;


        drag.node.style
            .setProperty(
                "transform",
                `translate3d(${drag.dx}px,0,0)`,
                "important"
            );


        drag.currentOrder =
            [
                ...wanted
            ];


        animateFlip(
            before,
            drag.node
        );


        /*
         * Re-anchor against the pointer immediately.
         */

        const targetLeft =
            event.clientX
            -
            drag.grabOffset;


        drag.dx =
            targetLeft
            -
            drag.baseLeft;


        drag.node.style
            .setProperty(
                "transform",
                `translate3d(${drag.dx}px,0,0)`,
                "important"
            );
    }


    function moveMajorDrag(
        event
    ) {

        if (
            !drag
            ||
            event.pointerId
                !==
                drag.pointerId
        ) {
            return;
        }


        event.preventDefault();


        const targetLeft =
            event.clientX
            -
            drag.grabOffset;


        drag.dx =
            targetLeft
            -
            drag.baseLeft;


        drag.node.style
            .setProperty(
                "transform",
                `translate3d(${drag.dx}px,0,0)`,
                "important"
            );


        const wanted =
            desiredOrderAtX(
                drag.key,
                event.clientX
            );


        reorderDuringDrag(
            event,
            wanted
        );
    }


    function cleanupMajorDrag(
        settle = true
    ) {

        if (!drag) {
            return;
        }


        const state =
            drag;


        document.body
            .classList
            .remove(
                "fd-slam-major-drag-active-v5"
            );


        state.node
            .classList
            .remove(
                "fd-slam-major-dragging-v5"
            );


        state.handle
            .classList
            .remove(
                "fd-slam-handle-active-v5"
            );


        state.node.style
            .removeProperty(
                "transform"
            );


        if (
            settle
            &&
            Math.abs(
                state.dx
            )
            >
            0.5
        ) {

            try {

                state.node
                    .animate(
                        [
                            {
                                transform:
                                    `translate3d(${state.dx}px,0,0)`,
                            },
                            {
                                transform:
                                    "translate3d(0,0,0)",
                            },
                        ],
                        {
                            duration:
                                FLIP_MS,

                            easing:
                                FLIP_EASING,

                            fill:
                                "both",
                        }
                    );

            }

            catch (_) {
            }
        }


        try {

            state.handle
                .releasePointerCapture(
                    state.pointerId
                );

        }

        catch (_) {
        }


        window.removeEventListener(
            "pointermove",
            moveMajorDrag,
            true
        );


        window.removeEventListener(
            "pointerup",
            finishMajorDrag,
            true
        );


        window.removeEventListener(
            "pointercancel",
            cancelMajorDrag,
            true
        );


        drag =
            null;
    }


    function finishMajorDrag(
        event
    ) {

        if (
            !drag
            ||
            event.pointerId
                !==
                drag.pointerId
        ) {
            return;
        }


        saveOrder();

        cleanupMajorDrag(
            true
        );
    }


    function cancelMajorDrag(
        event
    ) {

        if (
            !drag
            ||
            event.pointerId
                !==
                drag.pointerId
        ) {
            return;
        }


        const before =
            captureRects();


        appendInOrder(
            drag.startOrder
        );


        applyWidths(
            drag.startOrder,
            drag.widths
        );


        animateFlip(
            before
        );


        cleanupMajorDrag(
            false
        );
    }


    function beginMajorDrag(
        event,
        key,
        node,
        handle
    ) {

        if (
            drag
            ||
            event.button
                !==
                0
        ) {
            return;
        }


        event.preventDefault();


        const rect =
            node
                .getBoundingClientRect();


        drag = {
            pointerId:
                event.pointerId,

            key,

            node,

            handle,

            startOrder:
                currentOrder(),

            currentOrder:
                currentOrder(),

            widths:
                widthsByKey(),

            grabOffset:
                event.clientX
                -
                rect.left,

            baseLeft:
                rect.left,

            dx:
                0,
        };


        document.body
            .classList
            .add(
                "fd-slam-major-drag-active-v5"
            );


        node.classList
            .add(
                "fd-slam-major-dragging-v5"
            );


        handle.classList
            .add(
                "fd-slam-handle-active-v5"
            );


        try {

            handle.setPointerCapture(
                event.pointerId
            );

        }

        catch (_) {
        }


        window.addEventListener(
            "pointermove",
            moveMajorDrag,
            true
        );


        window.addEventListener(
            "pointerup",
            finishMajorDrag,
            true
        );


        window.addEventListener(
            "pointercancel",
            cancelMajorDrag,
            true
        );
    }


    function keyboardMove(
        event,
        key
    ) {

        if (
            event.key
                !==
                "ArrowLeft"
            &&
            event.key
                !==
                "ArrowRight"
        ) {
            return;
        }


        event.preventDefault();


        const order =
            currentOrder();


        const index =
            order.indexOf(
                key
            );


        const nextIndex =
            event.key
                ===
                "ArrowLeft"
            ?
                Math.max(
                    0,
                    index - 1
                )
            :
                Math.min(
                    order.length - 1,
                    index + 1
                );


        if (
            index ===
                nextIndex
        ) {
            return;
        }


        const before =
            captureRects();


        const widths =
            widthsByKey();


        order.splice(
            index,
            1
        );


        order.splice(
            nextIndex,
            0,
            key
        );


        appendInOrder(
            order
        );


        applyWidths(
            order,
            widths
        );


        animateFlip(
            before
        );


        saveOrder();
    }


    function maintainIdentityWidths() {

        if (
            !shell
            ||
            drag
        ) {
            return;
        }


        const order =
            currentOrder();


        if (
            order.length
                !==
                3
        ) {
            return;
        }


        const gap =
            visualGap();


        const available =
            Math.max(
                1,
                shell
                    .getBoundingClientRect()
                    .width
                -
                gap * 2
            );


        const side =
            Math.max(
                270,
                Math.min(
                    320,
                    available
                    *
                    .185
                )
            );


        const map =
            Math.max(
                420,
                available
                -
                side * 2
            );


        applyWidths(
            order,
            {
                robot:
                    side,

                map,

                car:
                    side,
            }
        );
    }


    /* ========================================================
       BOOT
       ======================================================== */


    function boot() {

        installMappingController();


        if (
            installMajorIdentity()
        ) {

            restoreOrder();

            maintainIdentityWidths();

            copyLiveControllerGeometry();


            window.addEventListener(
                "resize",
                maintainIdentityWidths
            );
        }


        syncMappingButtonPresentation();


        /*
         * Parent Live controls may finish their own late styling
         * shortly after initial DOM creation.
         */

        window.setTimeout(
            copyLiveControllerGeometry,
            150
        );


        window.setTimeout(
            copyLiveControllerGeometry,
            700
        );
    }


    if (
        document.readyState
        ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once:
                    true,
            }
        );
    }

    else {

        boot();
    }

})();

/* ===== END full_dashboard_motion_v5.js ===== */

/* ===== BEGIN full_dashboard_detail_v6.js ===== */
/* ============================================================
   FULL_DASH_SLAM_DETAIL_JS_V6

   Presentation bridge only.

   It samples the ACTUAL rendered Live-tab controls in the
   parent document and applies their computed styling to the
   imported Nav2 UI.

   Existing SLAM/Nav2 buttons/selects remain authoritative.
   ============================================================ */

(() => {
    "use strict";


    const $ =
        id =>
            document.getElementById(
                id
            );


    function cleanText(
        value
    ) {

        return String(
            value
            ||
            ""
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
    }


    function parentDocument() {

        try {

            if (
                window.parent
                &&
                window.parent
                    !==
                    window
            ) {

                return (
                    window.parent
                        .document
                );
            }

        }

        catch (_) {
        }


        return null;
    }


    function parentStyle(
        node
    ) {

        if (!node) {
            return null;
        }


        try {

            return (
                window.parent
                    .getComputedStyle(
                        node
                    )
            );

        }

        catch (_) {

            return null;
        }
    }


    function cssName(
        property
    ) {

        return property.replace(
            /[A-Z]/g,
            char =>
                "-"
                +
                char.toLowerCase()
        );
    }


    function copyComputed(
        source,
        target,
        properties
    ) {

        if (
            !source
            ||
            !target
        ) {
            return false;
        }


        const style =
            parentStyle(
                source
            );


        if (!style) {
            return false;
        }


        for (
            const property
            of properties
        ) {

            const value =
                style[property];


            if (
                value ===
                    undefined
                ||
                value ===
                    null
                ||
                value ===
                    ""
            ) {
                continue;
            }


            target.style
                .setProperty(
                    cssName(
                        property
                    ),
                    value,
                    "important"
                );
        }


        return true;
    }


    const FONT_PROPS = [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "lineHeight",
        "letterSpacing",
        "textTransform",
        "color",
    ];


    const SURFACE_PROPS = [
        "background",
        "backgroundColor",
        "backgroundImage",

        "borderTopWidth",
        "borderTopStyle",
        "borderTopColor",

        "borderRightWidth",
        "borderRightStyle",
        "borderRightColor",

        "borderBottomWidth",
        "borderBottomStyle",
        "borderBottomColor",

        "borderLeftWidth",
        "borderLeftStyle",
        "borderLeftColor",

        "borderRadius",
        "boxShadow",
    ];


    const BUTTON_PROPS = [
        "height",
        "minHeight",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",

        "background",
        "backgroundColor",
        "backgroundImage",

        "color",

        "borderTopWidth",
        "borderTopStyle",
        "borderTopColor",

        "borderRightWidth",
        "borderRightStyle",
        "borderRightColor",

        "borderBottomWidth",
        "borderBottomStyle",
        "borderBottomColor",

        "borderLeftWidth",
        "borderLeftStyle",
        "borderLeftColor",

        "borderRadius",
        "boxShadow",

        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "lineHeight",
        "letterSpacing",
        "textTransform",

        "textAlign",
    ];


    const WRAPPER_PROPS = [
        "height",
        "minHeight",

        "background",
        "backgroundColor",
        "backgroundImage",

        "borderTopWidth",
        "borderTopStyle",
        "borderTopColor",

        "borderRightWidth",
        "borderRightStyle",
        "borderRightColor",

        "borderBottomWidth",
        "borderBottomStyle",
        "borderBottomColor",

        "borderLeftWidth",
        "borderLeftStyle",
        "borderLeftColor",

        "borderRadius",
        "boxShadow",
    ];


    const ROW_PROPS = [
        "display",
        "alignItems",
        "justifyContent",
        "columnGap",
        "rowGap",
        "gridTemplateColumns",
        "minHeight",
        "height",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "marginTop",
        "marginRight",
        "marginBottom",
        "marginLeft",
    ];


    /* ========================================================
       LIVE REFERENCE FINDERS
       ======================================================== */


    function findExactLeaf(
        root,
        wanted
    ) {

        if (!root) {
            return null;
        }


        const needle =
            wanted
                .toLowerCase();


        return [
            ...root.querySelectorAll(
                "*"
            )
        ]
        .find(
            node => {

                if (
                    node.children.length
                        !==
                        0
                ) {
                    return false;
                }


                return (
                    cleanText(
                        node.textContent
                    )
                    .toLowerCase()
                    ===
                    needle
                );
            }
        )
        ||
        null;
    }


    function findLiveReset(
        doc
    ) {

        if (!doc) {
            return null;
        }


        return [
            ...doc.querySelectorAll(
                "#view-live button"
            )
        ]
        .find(
            button =>
                cleanText(
                    button.textContent
                )
                .toLowerCase()
                ===
                "reset view"
        )
        ||
        null;
    }


    function findLiveStatusPanel(
        doc
    ) {

        if (!doc) {
            return null;
        }


        const direct =
            doc.getElementById(
                "teleopStatusPanelV21"
            );


        if (direct) {
            return direct;
        }


        return [
            ...doc.querySelectorAll(
                "#view-live "
                +
                ".combined-rail "
                +
                ".panel"
            )
        ]
        .find(
            panel => {

                const status =
                    findExactLeaf(
                        panel,
                        "STATUS"
                    );


                const xr =
                    findExactLeaf(
                        panel,
                        "Xr"
                    );


                const fault =
                    findExactLeaf(
                        panel,
                        "Fault"
                    );


                return Boolean(
                    status
                    &&
                    xr
                    &&
                    fault
                );
            }
        )
        ||
        null;
    }


    function findLiveStatusRow(
        panel
    ) {

        const label =
            findExactLeaf(
                panel,
                "Xr"
            )
            ||
            findExactLeaf(
                panel,
                "Fault"
            )
            ||
            findExactLeaf(
                panel,
                "Inspire"
            );


        if (!label) {
            return {
                row:
                    null,

                label:
                    null,

                value:
                    null,
            };
        }


        let row =
            label.parentElement;


        while (
            row
            &&
            row !== panel
        ) {

            const value =
                row.querySelector(
                    "strong"
                );


            if (value) {

                return {
                    row,
                    label,
                    value,
                };
            }


            row =
                row.parentElement;
        }


        return {
            row:
                label.parentElement,

            label,

            value:
                null,
        };
    }


    /* ========================================================
       SECTION SURFACE = LIVE STATUS
       ======================================================== */


    function syncSectionSurfaces(
        doc
    ) {

        const statusPanel =
            findLiveStatusPanel(
                doc
            );


        if (!statusPanel) {
            return;
        }


        document
            .querySelectorAll(
                "section.control-card"
            )
            .forEach(
                card => {

                    copyComputed(
                        statusPanel,
                        card,
                        SURFACE_PROPS
                    );
                }
            );
    }


    /* ========================================================
       SESSION / CAPTURE VALUES = LIVE STATUS ROWS
       ======================================================== */


    function syncMappingStatusRows(
        doc
    ) {

        const progress =
            document.querySelector(
                ".mapping-progress"
            );


        if (!progress) {
            return;
        }


        progress.classList.add(
            "fd-status-stack-v6"
        );


        const statusPanel =
            findLiveStatusPanel(
                doc
            );


        const reference =
            findLiveStatusRow(
                statusPanel
            );


        for (
            const row
            of progress.children
        ) {

            const label =
                row.querySelector(
                    "span"
                );


            const value =
                row.querySelector(
                    "b, strong"
                );


            if (
                reference.row
            ) {

                copyComputed(
                    reference.row,
                    row,
                    ROW_PROPS
                );
            }


            if (
                reference.label
                &&
                label
            ) {

                copyComputed(
                    reference.label,
                    label,
                    FONT_PROPS
                );
            }


            if (
                reference.value
                &&
                value
            ) {

                copyComputed(
                    reference.value,
                    value,
                    FONT_PROPS
                );
            }
        }
    }


    /* ========================================================
       REMOVE MAPPING HELP
       ======================================================== */


    function removeMappingInstruction() {

        for (
            const paragraph
            of document.querySelectorAll(
                ".control-card .help"
            )
        ) {

            const text =
                cleanText(
                    paragraph.textContent
                )
                .toLowerCase();


            if (
                text.startsWith(
                    "move the robot slowly"
                )
            ) {

                paragraph.remove();

                return;
            }
        }
    }


    /* ========================================================
       EXACT CONFIGURE / STOP PRESENTATION
       ======================================================== */


    function mappingPaused() {

        const pause =
            $("pause-map");


        if (!pause) {
            return false;
        }


        return (
            pause.classList
                .contains(
                    "fd-map-resume-v5"
                )
            ||
            /\bresume\b/i
                .test(
                    cleanText(
                        pause.textContent
                    )
                )
        );
    }


    function forceMappingIcons() {

        const start =
            $("start-map");


        const stop =
            $("stop-map");


        const pause =
            $("pause-map");


        if (
            start
            &&
            !/◇/
                .test(
                    start.textContent
                )
        ) {

            start.textContent =
                "◇ Start mapping";
        }


        if (
            stop
            &&
            !/×/
                .test(
                    stop.textContent
                )
        ) {

            stop.textContent =
                "× Stop";
        }


        if (pause) {

            const resume =
                mappingPaused();


            const wantedPauseText =
                resume
                ?
                "◇ Resume"
                :
                "Ⅱ Pause";


            /*
             * V6.1:
             * Do NOT write textContent when it is already correct.
             *
             * The button is observed below so an unconditional write
             * creates:
             *
             * text mutation -> observer -> sync -> text mutation ...
             *
             * which can starve the browser main thread.
             */
            if (
                cleanText(
                    pause.textContent
                )
                !==
                cleanText(
                    wantedPauseText
                )
            ) {

                pause.textContent =
                    wantedPauseText;
            }


            pause.classList.toggle(
                "fd-map-resume-v5",
                resume
            );


            pause.classList.toggle(
                "fd-map-pause-v5",
                !resume
            );
        }
    }


    function syncMappingController(
        doc
    ) {

        if (!doc) {
            return;
        }


        const configure =
            doc.getElementById(
                "controllerConfigureBtn"
            );


        const liveStop =
            doc.getElementById(
                "controllerStopBtn"
            );


        const liveSwitch =
            doc.getElementById(
                "controllerProcessSwitchV16"
            );


        const start =
            $("start-map");


        const stop =
            $("stop-map");


        const pause =
            $("pause-map");


        const primary =
            document.querySelector(
                ".fd-map-primary-row-v5"
            );


        const secondary =
            document.querySelector(
                ".fd-map-secondary-row-v5"
            );


        if (
            !configure
            ||
            !liveStop
            ||
            !liveSwitch
            ||
            !start
            ||
            !stop
            ||
            !pause
            ||
            !primary
            ||
            !secondary
        ) {
            return;
        }


        copyComputed(
            liveSwitch,
            primary,
            WRAPPER_PROPS
        );


        copyComputed(
            liveSwitch,
            secondary,
            WRAPPER_PROPS
        );


        copyComputed(
            configure,
            start,
            BUTTON_PROPS
        );


        copyComputed(
            liveStop,
            stop,
            BUTTON_PROPS
        );


        const pauseSource =
            mappingPaused()
            ?
            configure
            :
            liveStop;


        copyComputed(
            pauseSource,
            pause,
            BUTTON_PROPS
        );


        /*
         * Exact segmented geometry.
         */

        primary.style
            .setProperty(
                "display",
                "grid",
                "important"
            );


        primary.style
            .setProperty(
                "grid-template-columns",
                "minmax(0,1fr) minmax(0,1fr)",
                "important"
            );


        primary.style
            .setProperty(
                "width",
                "100%",
                "important"
            );


        primary.style
            .setProperty(
                "overflow",
                "hidden",
                "important"
            );


        secondary.style
            .setProperty(
                "display",
                "block",
                "important"
            );


        secondary.style
            .setProperty(
                "width",
                "100%",
                "important"
            );


        secondary.style
            .setProperty(
                "overflow",
                "hidden",
                "important"
            );


        start.style
            .setProperty(
                "width",
                "100%",
                "important"
            );


        stop.style
            .setProperty(
                "width",
                "100%",
                "important"
            );


        pause.style
            .setProperty(
                "width",
                "100%",
                "important"
            );


        /*
         * Primary pair uses the wrapper's outside rounding,
         * exactly like Configure / Stop.
         */

        start.style
            .setProperty(
                "border-radius",
                "0",
                "important"
            );


        stop.style
            .setProperty(
                "border-radius",
                "0",
                "important"
            );


        /*
         * Single Pause/Resume fills the second matching shell.
         */

        const switchStyle =
            parentStyle(
                liveSwitch
            );


        if (
            switchStyle
            &&
            switchStyle.borderRadius
        ) {

            pause.style
                .setProperty(
                    "border-radius",
                    switchStyle.borderRadius,
                    "important"
                );
        }


        forceMappingIcons();
    }


    /* ========================================================
       RESET VIEW BUTTON PARITY
       ======================================================== */


    function syncResetStyleButtons(
        doc
    ) {

        const reset =
            findLiveReset(
                doc
            );


        if (!reset) {
            return;
        }


        const ids = [
            "save-map",
            "refresh-partials",
            "view-partial",
            "download-partial",
        ];


        for (
            const id
            of ids
        ) {

            const button =
                $(id);


            if (!button) {
                continue;
            }


            button.classList.add(
                "fd-live-reset-v6"
            );


            copyComputed(
                reset,
                button,
                BUTTON_PROPS
            );


            /*
             * Preserve layout ownership.  The visual surface and
             * typography are exact; widths remain appropriate for
             * the local field/button layout.
             */

            button.style
                .removeProperty(
                    "width"
                );


            button.style
                .removeProperty(
                    "min-width"
                );


            button.style
                .removeProperty(
                    "max-width"
                );
        }
    }


    /* ========================================================
       COMPOSITE-STYLE PARTIAL SESSION DROPDOWN
       ======================================================== */


    let partialRoot =
        null;


    let partialTrigger =
        null;


    let partialLabel =
        null;


    let partialChevron =
        null;


    let partialMenu =
        null;


    function liveCompositeRefs(
        doc
    ) {

        if (!doc) {
            return {};
        }


        const root =
            doc.getElementById(
                "stitchHealthDropdownV174"
            );


        const trigger =
            root
            ?.querySelector(
                ".stitch-health-trigger-v174"
            );


        const chevron =
            root
            ?.querySelector(
                ".stitch-health-chevron-v174"
            );


        const menu =
            doc.querySelector(
                "body > "
                +
                ".stitch-health-menu-v174"
            );


        const option =
            menu
            ?.querySelector(
                ".stitch-health-option-v174"
            );


        const selected =
            menu
            ?.querySelector(
                ".stitch-health-option-v174.selected"
            );


        return {
            root,
            trigger,
            chevron,
            menu,
            option,
            selected,
        };
    }


    function positionPartialMenu() {

        if (
            !partialTrigger
            ||
            !partialMenu
            ||
            partialMenu.hidden
        ) {
            return;
        }


        const rect =
            partialTrigger
                .getBoundingClientRect();


        partialMenu.style.left =
            `${Math.round(
                rect.left
            )}px`;


        partialMenu.style.top =
            `${Math.round(
                rect.bottom
                +
                5
            )}px`;


        partialMenu.style.width =
            `${Math.round(
                rect.width
            )}px`;
    }


    function closePartialMenu() {

        if (
            !partialMenu
            ||
            !partialRoot
        ) {
            return;
        }


        partialMenu.hidden =
            true;


        partialRoot.classList
            .remove(
                "open"
            );


        partialTrigger
            ?.setAttribute(
                "aria-expanded",
                "false"
            );
    }


    function openPartialMenu() {

        const native =
            $("partial-sessions");


        if (
            !partialMenu
            ||
            !partialRoot
            ||
            !partialTrigger
            ||
            native?.disabled
        ) {
            return;
        }


        partialMenu.hidden =
            false;


        partialRoot.classList
            .add(
                "open"
            );


        partialTrigger.setAttribute(
            "aria-expanded",
            "true"
        );


        positionPartialMenu();
    }


    function applyCompositeStyles(
        doc
    ) {

        if (
            !partialTrigger
            ||
            !partialMenu
        ) {
            return;
        }


        const refs =
            liveCompositeRefs(
                doc
            );


        if (
            refs.trigger
        ) {

            copyComputed(
                refs.trigger,
                partialTrigger,
                [
                    ...BUTTON_PROPS,
                    "cursor",
                    "justifyContent",
                    "alignItems",
                ]
            );


            partialTrigger.style
                .setProperty(
                    "width",
                    "100%",
                    "important"
                );


            partialTrigger.style
                .setProperty(
                    "min-width",
                    "0",
                    "important"
                );
        }


        if (
            refs.chevron
            &&
            partialChevron
        ) {

            copyComputed(
                refs.chevron,
                partialChevron,
                [
                    "width",
                    "height",
                    "marginLeft",
                    "borderTopWidth",
                    "borderTopStyle",
                    "borderTopColor",
                    "borderRightWidth",
                    "borderRightStyle",
                    "borderRightColor",
                    "borderBottomWidth",
                    "borderBottomStyle",
                    "borderBottomColor",
                    "borderLeftWidth",
                    "borderLeftStyle",
                    "borderLeftColor",
                    "color",
                ]
            );
        }


        if (
            refs.menu
        ) {

            copyComputed(
                refs.menu,
                partialMenu,
                [
                    "background",
                    "backgroundColor",
                    "backgroundImage",

                    "borderTopWidth",
                    "borderTopStyle",
                    "borderTopColor",

                    "borderRightWidth",
                    "borderRightStyle",
                    "borderRightColor",

                    "borderBottomWidth",
                    "borderBottomStyle",
                    "borderBottomColor",

                    "borderLeftWidth",
                    "borderLeftStyle",
                    "borderLeftColor",

                    "borderRadius",
                    "boxShadow",

                    "paddingTop",
                    "paddingRight",
                    "paddingBottom",
                    "paddingLeft",

                    "rowGap",
                    "columnGap",
                ]
            );
        }


        document
            .querySelectorAll(
                ".fd-partial-option-v6"
            )
            .forEach(
                option => {

                    const ref =
                        option.classList
                            .contains(
                                "selected"
                            )
                        ?
                        (
                            refs.selected
                            ||
                            refs.option
                        )
                        :
                        refs.option;


                    if (!ref) {
                        return;
                    }


                    copyComputed(
                        ref,
                        option,
                        BUTTON_PROPS
                    );


                    option.style
                        .setProperty(
                            "width",
                            "100%",
                            "important"
                        );


                    option.style
                        .setProperty(
                            "text-align",
                            "left",
                            "important"
                        );
                }
            );
    }


    function syncPartialSelection(
        doc
    ) {

        const native =
            $("partial-sessions");


        if (
            !native
            ||
            !partialLabel
        ) {
            return;
        }


        const selected =
            native.options[
                native.selectedIndex
            ];


        partialLabel.textContent =
            selected
            ?
            selected.textContent
            :
            "No saved sessions...";


        partialTrigger.disabled =
            Boolean(
                native.disabled
            );


        document
            .querySelectorAll(
                ".fd-partial-option-v6"
            )
            .forEach(
                option => {

                    const active =
                        option.dataset.value
                        ===
                        native.value;


                    option.classList.toggle(
                        "selected",
                        active
                    );


                    option.setAttribute(
                        "aria-selected",
                        active
                        ?
                        "true"
                        :
                        "false"
                    );
                }
            );


        applyCompositeStyles(
            doc
        );
    }


    function rebuildPartialOptions(
        doc
    ) {

        const native =
            $("partial-sessions");


        if (
            !native
            ||
            !partialMenu
        ) {
            return;
        }


        partialMenu.replaceChildren();


        for (
            const nativeOption
            of native.options
        ) {

            const option =
                document.createElement(
                    "button"
                );


            option.type =
                "button";


            option.className =
                "fd-partial-option-v6";


            option.dataset.value =
                nativeOption.value;


            option.textContent =
                nativeOption.textContent;


            option.setAttribute(
                "role",
                "option"
            );


            option.addEventListener(
                "click",
                () => {

                    native.value =
                        nativeOption.value;


                    native.dispatchEvent(
                        new Event(
                            "change",
                            {
                                bubbles:
                                    true,
                            }
                        )
                    );


                    syncPartialSelection(
                        doc
                    );


                    closePartialMenu();


                    partialTrigger
                        ?.focus();
                }
            );


            partialMenu.appendChild(
                option
            );
        }


        syncPartialSelection(
            doc
        );
    }


    function installPartialDropdown(
        doc
    ) {

        const native =
            $("partial-sessions");


        if (
            !native
            ||
            partialRoot
        ) {
            return;
        }


        native.classList.add(
            "fd-native-select-v6"
        );


        partialRoot =
            document.createElement(
                "div"
            );


        partialRoot.className =
            "fd-partial-dropdown-v6";


        partialTrigger =
            document.createElement(
                "button"
            );


        partialTrigger.type =
            "button";


        partialTrigger.className =
            "fd-partial-trigger-v6";


        partialTrigger.setAttribute(
            "aria-haspopup",
            "listbox"
        );


        partialTrigger.setAttribute(
            "aria-expanded",
            "false"
        );


        partialLabel =
            document.createElement(
                "span"
            );


        partialLabel.className =
            "fd-partial-label-v6";


        partialChevron =
            document.createElement(
                "span"
            );


        partialChevron.className =
            "fd-partial-chevron-v6";


        partialChevron.setAttribute(
            "aria-hidden",
            "true"
        );


        partialTrigger.append(
            partialLabel,
            partialChevron
        );


        partialRoot.appendChild(
            partialTrigger
        );


        native.insertAdjacentElement(
            "afterend",
            partialRoot
        );


        partialMenu =
            document.createElement(
                "div"
            );


        partialMenu.className =
            "fd-partial-menu-v6";


        partialMenu.setAttribute(
            "role",
            "listbox"
        );


        partialMenu.hidden =
            true;


        document.body.appendChild(
            partialMenu
        );


        partialTrigger.addEventListener(
            "click",
            event => {

                event.preventDefault();


                if (
                    partialMenu.hidden
                ) {

                    openPartialMenu();

                }

                else {

                    closePartialMenu();
                }
            }
        );


        partialTrigger.addEventListener(
            "keydown",
            event => {

                if (
                    event.key
                    ===
                    "Escape"
                ) {

                    closePartialMenu();

                    return;
                }


                if (
                    event.key
                    ===
                    "ArrowDown"
                ) {

                    event.preventDefault();

                    openPartialMenu();


                    const selected =
                        partialMenu.querySelector(
                            ".selected"
                        )
                        ||
                        partialMenu.querySelector(
                            ".fd-partial-option-v6"
                        );


                    selected
                        ?.focus();
                }
            }
        );


        partialMenu.addEventListener(
            "keydown",
            event => {

                const options = [
                    ...partialMenu
                        .querySelectorAll(
                            ".fd-partial-option-v6"
                        )
                ];


                if (
                    !options.length
                ) {
                    return;
                }


                if (
                    event.key
                    ===
                    "Escape"
                ) {

                    event.preventDefault();

                    closePartialMenu();

                    partialTrigger
                        .focus();

                    return;
                }


                if (
                    event.key
                    !==
                    "ArrowDown"
                    &&
                    event.key
                    !==
                    "ArrowUp"
                ) {
                    return;
                }


                event.preventDefault();


                const current =
                    options.indexOf(
                        document.activeElement
                    );


                const step =
                    event.key
                    ===
                    "ArrowDown"
                    ?
                    1
                    :
                    -1;


                const next =
                    (
                        current
                        +
                        step
                        +
                        options.length
                    )
                    %
                    options.length;


                options[next]
                    ?.focus();
            }
        );


        document.addEventListener(
            "pointerdown",
            event => {

                if (
                    partialRoot
                        ?.contains(
                            event.target
                        )
                    ||
                    partialMenu
                        ?.contains(
                            event.target
                        )
                ) {
                    return;
                }


                closePartialMenu();
            }
        );


        native.addEventListener(
            "change",
            () =>
                syncPartialSelection(
                    doc
                )
        );


        new MutationObserver(
            () =>
                rebuildPartialOptions(
                    doc
                )
        )
        .observe(
            native,
            {
                childList:
                    true,

                subtree:
                    true,

                attributes:
                    true,
            }
        );


        window.addEventListener(
            "resize",
            positionPartialMenu
        );


        window.addEventListener(
            "scroll",
            positionPartialMenu,
            true
        );


        rebuildPartialOptions(
            doc
        );
    }


    /* ========================================================
       PAUSE / RESUME STATE STYLE SYNC
       ======================================================== */


    function installPauseStyleSync(
        doc
    ) {

        const pause =
            $("pause-map");


        if (!pause) {
            return;
        }


        new MutationObserver(
            () => {

                /*
                 * Let V5 normalize its label first.
                 */

                queueMicrotask(
                    () =>
                        syncMappingController(
                            doc
                        )
                );
            }
        )
        .observe(
            pause,
            {
                childList:
                    true,

                characterData:
                    true,

                subtree:
                    true,
            }
        );
    }


    /* ========================================================
       ALL EXACT LIVE REFERENCES
       ======================================================== */


    function syncExactLiveReferences() {

        const doc =
            parentDocument();


        if (!doc) {
            return;
        }


        syncSectionSurfaces(
            doc
        );


        syncMappingStatusRows(
            doc
        );


        syncMappingController(
            doc
        );


        syncResetStyleButtons(
            doc
        );


        applyCompositeStyles(
            doc
        );


        syncPartialSelection(
            doc
        );
    }


    /* ========================================================
       BOOT
       ======================================================== */


    function boot() {

        const doc =
            parentDocument();


        removeMappingInstruction();


        syncMappingStatusRows(
            doc
        );


        installPartialDropdown(
            doc
        );


        installPauseStyleSync(
            doc
        );


        syncExactLiveReferences();


        /*
         * The parent Full-Dash late style owners can complete
         * just after the iframe DOM.  Re-sample a few times only.
         *
         * No repeating polling loop.
         */

        window.setTimeout(
            syncExactLiveReferences,
            100
        );


        window.setTimeout(
            syncExactLiveReferences,
            400
        );


        window.setTimeout(
            syncExactLiveReferences,
            1000
        );
    }


    if (
        document.readyState
        ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once:
                    true,
            }
        );

    }

    else {

        boot();
    }

})();


/* ============================================================
   FULL_DASH_SLAM_DETAIL_V61_LOOP_FIX

   Prevent the Pause/Resume MutationObserver from recursively
   retriggering itself through an unconditional textContent write.
   ============================================================ */

/* ===== END full_dashboard_detail_v6.js ===== */

/* ===== BEGIN full_dashboard_detail_v7.js ===== */
/* ============================================================
   FULL_DASH_SLAM_DETAIL_JS_V7
   Presentation only.
   ============================================================ */

(() => {
    "use strict";

    const $ =
        id =>
            document.getElementById(id);


    const clean =
        value =>
            String(value || "")
                .replace(/\s+/g, " ")
                .trim();


    function parentDoc() {

        try {

            if (
                window.parent
                &&
                window.parent !== window
            ) {
                return window.parent.document;
            }

        } catch (_) {
        }

        return null;
    }


    function pStyle(node) {

        if (!node) {
            return null;
        }

        try {
            return window.parent.getComputedStyle(node);
        } catch (_) {
            return null;
        }
    }


    function cssName(name) {

        return name.replace(
            /[A-Z]/g,
            c => "-" + c.toLowerCase()
        );
    }


    function copy(
        source,
        target,
        props
    ) {

        if (
            !source
            ||
            !target
        ) {
            return;
        }

        const style =
            pStyle(source);

        if (!style) {
            return;
        }

        for (const prop of props) {

            const value =
                style[prop];

            if (
                value === undefined
                ||
                value === null
                ||
                value === ""
            ) {
                continue;
            }

            target.style.setProperty(
                cssName(prop),
                value,
                "important"
            );
        }
    }


    const FONT = [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "lineHeight",
        "letterSpacing",
        "textTransform",
        "color",
    ];


    const BUTTON = [
        "height",
        "minHeight",

        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",

        "background",
        "backgroundColor",
        "backgroundImage",

        "borderTopWidth",
        "borderTopStyle",
        "borderTopColor",

        "borderRightWidth",
        "borderRightStyle",
        "borderRightColor",

        "borderBottomWidth",
        "borderBottomStyle",
        "borderBottomColor",

        "borderLeftWidth",
        "borderLeftStyle",
        "borderLeftColor",

        "borderRadius",
        "boxShadow",

        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "lineHeight",
        "letterSpacing",
        "textTransform",

        "color",
        "display",
        "alignItems",
        "justifyContent",
        "gap",
    ];


    const SURFACE = [
        "background",
        "backgroundColor",
        "backgroundImage",

        "borderTopWidth",
        "borderTopStyle",
        "borderTopColor",

        "borderRightWidth",
        "borderRightStyle",
        "borderRightColor",

        "borderBottomWidth",
        "borderBottomStyle",
        "borderBottomColor",

        "borderLeftWidth",
        "borderLeftStyle",
        "borderLeftColor",

        "borderRadius",
        "boxShadow",
    ];


    function exactLeaf(
        root,
        text
    ) {

        if (!root) {
            return null;
        }

        const wanted =
            clean(text).toLowerCase();

        return [
            ...root.querySelectorAll("*")
        ]
        .find(
            node =>
                node.children.length === 0
                &&
                clean(node.textContent)
                    .toLowerCase()
                ===
                wanted
        )
        || null;
    }


    function liveRefs() {

        const doc =
            parentDoc();

        if (!doc) {
            return {};
        }

        const configure =
            doc.getElementById(
                "controllerConfigureBtn"
            );

        const stop =
            doc.getElementById(
                "controllerStopBtn"
            );

        const controllerSwitch =
            doc.getElementById(
                "controllerProcessSwitchV16"
            );

        const reset =
            [
                ...doc.querySelectorAll(
                    "#view-live button"
                )
            ]
            .find(
                button =>
                    clean(button.textContent)
                        .toLowerCase()
                    ===
                    "reset view"
            )
            || null;

        const composite =
            doc.querySelector(
                "#stitchHealthDropdownV174 "
                +
                ".stitch-health-trigger-v174"
            );

        const compositeMenu =
            doc.querySelector(
                "body > .stitch-health-menu-v174"
            );

        const compositeOption =
            compositeMenu
                ?.querySelector(
                    ".stitch-health-option-v174"
                )
            || null;

        const statusPanel =
            doc.getElementById(
                "teleopStatusPanelV21"
            )
            ||
            exactLeaf(
                doc.getElementById("view-live"),
                "STATUS"
            )
            ?.closest(
                ".panel"
            );

        const xr =
            exactLeaf(
                statusPanel,
                "Xr"
            );

        let statusRow =
            xr?.parentElement
            || null;

        let statusValue =
            null;

        while (
            statusRow
            &&
            statusRow !== statusPanel
        ) {

            const leaves = [
                ...statusRow.querySelectorAll("*")
            ]
            .filter(
                node =>
                    node.children.length === 0
                    &&
                    clean(node.textContent)
            );

            if (leaves.length >= 2) {

                statusValue =
                    leaves[
                        leaves.length - 1
                    ];

                break;
            }

            statusRow =
                statusRow.parentElement;
        }

        const liveGrid =
            doc.querySelector(
                "#view-live .combined-live-grid"
            );

        const liveRail =
            doc.querySelector(
                "#view-live .combined-rail"
            );

        const cameraTitle =
            exactLeaf(
                doc.getElementById("view-live"),
                "CAMERA MULTIVIEW"
            );

        const cameraMajor =
            cameraTitle
                ?.closest(
                    "aside,section,.panel,.camera-panel"
                )
            || null;

        const rgbIdle =
            exactLeaf(
                doc.getElementById("view-live"),
                "RGB stream idle"
            );

        return {
            doc,
            configure,
            stop,
            controllerSwitch,
            reset,
            composite,
            compositeMenu,
            compositeOption,
            statusPanel,
            statusLabel: xr,
            statusValue,
            statusRow,
            liveGrid,
            liveRail,
            cameraMajor,
            rgbIdle,
        };
    }


    /* ========================================================
       CONNECTION STRIP
       ======================================================== */

    function removeConnectionBlock() {

        document
            .querySelector(
                ".control-panel"
                +
                ":not(.car-side) "
                +
                "> .connection-strip"
            )
            ?.remove();
    }


    /* ========================================================
       LIVE GEOMETRY / SURFACES
       ======================================================== */

    function syncLiveGeometry() {

        const refs =
            liveRefs();

        const root =
            document.documentElement;


        if (refs.liveGrid) {

            const style =
                pStyle(
                    refs.liveGrid
                );

            if (style) {

                const top =
                    parseFloat(
                        style.paddingTop
                    );

                if (
                    Number.isFinite(top)
                    &&
                    top >= 0
                    &&
                    top <= 20
                ) {

                    root.style
                        .setProperty(
                            "--fd7-top-gap",
                            `${top}px`
                        );
                }
            }
        }


        const major =
            refs.liveRail
            ||
            refs.cameraMajor;


        if (major) {

            const style =
                pStyle(major);

            if (style) {

                root.style
                    .setProperty(
                        "--fd7-major-radius",
                        style.borderRadius
                    );
            }
        }


        if (refs.statusPanel) {

            const style =
                pStyle(
                    refs.statusPanel
                );

            if (style) {

                root.style.setProperty(
                    "--fd7-panel-radius",
                    style.borderRadius
                );

                root.style.setProperty(
                    "--fd7-panel-bg",
                    style.backgroundColor
                );

                root.style.setProperty(
                    "--fd7-panel-border",
                    style.borderTopColor
                );
            }
        }
    }


    /* ========================================================
       MAPPING CONTROLLER
       ======================================================== */

    function syncControllerStyle() {

        const refs =
            liveRefs();

        const start =
            $("start-map");

        const stop =
            $("stop-map");

        const pause =
            $("pause-map");

        const primary =
            document.querySelector(
                ".fd-map-primary-row-v5"
            );

        const secondary =
            document.querySelector(
                ".fd-map-secondary-row-v5"
            );


        if (
            !refs.configure
            ||
            !refs.stop
            ||
            !refs.controllerSwitch
            ||
            !start
            ||
            !stop
            ||
            !pause
            ||
            !primary
            ||
            !secondary
        ) {
            return;
        }


        copy(
            refs.controllerSwitch,
            primary,
            SURFACE
        );

        copy(
            refs.controllerSwitch,
            secondary,
            SURFACE
        );

        copy(
            refs.configure,
            start,
            BUTTON
        );

        copy(
            refs.stop,
            stop,
            BUTTON
        );


        const resume =
            pause.classList.contains(
                "fd-map-resume-v5"
            )
            ||
            /\bresume\b/i.test(
                clean(
                    pause.textContent
                )
            );


        copy(
            resume
                ?
                refs.configure
                :
                refs.stop,
            pause,
            BUTTON
        );


        /*
         * Use actual Controller Process geometry,
         * but retain requested green / amber semantics.
         */

        start.style.setProperty(
            "color",
            "#8ecb7f",
            "important"
        );

        stop.style.setProperty(
            "color",
            "#d6a82d",
            "important"
        );

        pause.style.setProperty(
            "color",
            resume
                ?
                "#8ecb7f"
                :
                "#d6a82d",
            "important"
        );


        start.style.setProperty(
            "border-radius",
            "0",
            "important"
        );

        stop.style.setProperty(
            "border-radius",
            "0",
            "important"
        );

        pause.style.setProperty(
            "border-radius",
            "0",
            "important"
        );


        start.style.setProperty(
            "width",
            "100%",
            "important"
        );

        stop.style.setProperty(
            "width",
            "100%",
            "important"
        );

        pause.style.setProperty(
            "width",
            "100%",
            "important"
        );
    }


    /* ========================================================
       MAPPING STATUS
       Session
       Latest capture
       Captures every 5 s
       ======================================================== */

    function statusLabel(
        row
    ) {

        return clean(
            row
                ?.querySelector(
                    "span"
                )
                ?.textContent
        )
        .toLowerCase();
    }


    function syncMappingStatus() {

        const progress =
            document.querySelector(
                ".mapping-progress"
            );

        if (!progress) {
            return;
        }


        progress.classList.add(
            "fd-status-stack-v7"
        );


        const rows = [
            ...progress.children
        ];


        const wanted = [
            "session",
            "latest capture",
            "captures every 5 s",
        ];


        for (const name of wanted) {

            const row =
                rows.find(
                    candidate =>
                        statusLabel(candidate)
                        ===
                        name
                );

            if (row) {
                progress.appendChild(row);
            }
        }


        const refs =
            liveRefs();


        for (
            const row
            of progress.children
        ) {

            const label =
                row.querySelector(
                    "span"
                );

            const value =
                row.querySelector(
                    "b,strong"
                );


            if (
                refs.statusRow
            ) {

                copy(
                    refs.statusRow,
                    row,
                    [
                        "display",
                        "alignItems",
                        "justifyContent",
                        "gap",
                        "height",
                        "minHeight",
                        "paddingTop",
                        "paddingRight",
                        "paddingBottom",
                        "paddingLeft",
                    ]
                );
            }


            if (
                refs.statusLabel
                &&
                label
            ) {

                copy(
                    refs.statusLabel,
                    label,
                    FONT
                );
            }


            if (
                refs.statusValue
                &&
                value
            ) {

                copy(
                    refs.statusValue,
                    value,
                    FONT
                );
            }
        }


        /*
         * Final map name gets the exact same label typography.
         */

        for (
            const node
            of document.querySelectorAll(
                ".control-card "
                +
                "label,"
                +
                ".control-card "
                +
                ".field-label"
            )
        ) {

            if (
                clean(node.textContent)
                    .toLowerCase()
                ===
                "final map name"
            ) {

                node.classList.add(
                    "fd-final-map-label-v7"
                );


                if (
                    refs.statusLabel
                ) {

                    copy(
                        refs.statusLabel,
                        node,
                        FONT
                    );
                }
            }
        }
    }


    /* ========================================================
       RESET VIEW STYLE BUTTONS
       ======================================================== */

    function applyResetStyle(
        button
    ) {

        if (!button) {
            return;
        }


        const reset =
            liveRefs()
                .reset;


        if (!reset) {
            return;
        }


        button.classList.add(
            "fd-reset-style-v7"
        );


        copy(
            reset,
            button,
            BUTTON
        );


        button.style
            .removeProperty(
                "width"
            );

        button.style
            .removeProperty(
                "min-width"
            );

        button.style
            .removeProperty(
                "max-width"
            );
    }


    function utilityButtons() {

        const explicit = [
            $("save-map"),
            $("refresh-partials"),
            $("view-partial"),
            $("download-partial"),
        ];


        const wantedText = new Set([
            "view map",
            "download pcd",
            "clear visualization only",
        ]);


        for (
            const button
            of document.querySelectorAll(
                ".control-panel "
                +
                "button"
            )
        ) {

            if (
                wantedText.has(
                    clean(
                        button.textContent
                    )
                    .toLowerCase()
                )
            ) {
                explicit.push(
                    button
                );
            }
        }


        return [
            ...new Set(
                explicit.filter(Boolean)
            )
        ];
    }


    function syncUtilityButtons() {

        for (
            const button
            of utilityButtons()
        ) {

            applyResetStyle(
                button
            );
        }
    }


    /* ========================================================
       GENERIC CUSTOM SELECT
       ======================================================== */

    function styleLikeComposite(
        trigger,
        menu,
        options
    ) {

        const refs =
            liveRefs();


        if (
            refs.composite
            &&
            trigger
        ) {

            copy(
                refs.composite,
                trigger,
                BUTTON
            );


            trigger.style.setProperty(
                "width",
                "100%",
                "important"
            );

            trigger.style.setProperty(
                "min-width",
                "0",
                "important"
            );
        }


        if (
            refs.compositeMenu
            &&
            menu
        ) {

            copy(
                refs.compositeMenu,
                menu,
                SURFACE
            );


            copy(
                refs.compositeMenu,
                menu,
                [
                    "paddingTop",
                    "paddingRight",
                    "paddingBottom",
                    "paddingLeft",
                    "rowGap",
                    "columnGap",
                ]
            );
        }


        if (
            refs.compositeOption
        ) {

            for (
                const option
                of options
            ) {

                copy(
                    refs.compositeOption,
                    option,
                    BUTTON
                );


                option.style.setProperty(
                    "width",
                    "100%",
                    "important"
                );

                option.style.setProperty(
                    "text-align",
                    "left",
                    "important"
                );
            }
        }
    }


    function installMapDropdown() {

        if (
            document.querySelector(
                ".fd-map-dropdown-v7"
            )
        ) {
            return;
        }


        const native =
            [
                ...document.querySelectorAll(
                    "select"
                )
            ]
            .find(
                select => {

                    const text =
                        [
                            ...select.options
                        ]
                        .map(
                            option =>
                                clean(
                                    option.textContent
                                )
                                .toLowerCase()
                        );


                    return text.some(
                        value =>
                            value.includes(
                                "select a map"
                            )
                    );
                }
            );


        if (!native) {
            return;
        }


        native.classList.add(
            "fd-map-native-v7"
        );


        const row =
            native.closest(
                ".select-row"
            )
            ||
            native.parentElement;


        row?.classList.add(
            "fd-map-select-row-v7"
        );


        const root =
            document.createElement(
                "div"
            );


        root.className =
            "fd-map-dropdown-v7";


        const trigger =
            document.createElement(
                "button"
            );


        trigger.type =
            "button";


        trigger.className =
            "fd-map-trigger-v7";


        trigger.setAttribute(
            "aria-haspopup",
            "listbox"
        );


        trigger.setAttribute(
            "aria-expanded",
            "false"
        );


        const label =
            document.createElement(
                "span"
            );


        label.className =
            "fd-map-label-v7";


        const chevron =
            document.createElement(
                "span"
            );


        chevron.className =
            "fd-map-chevron-v7";


        /*
         * Reuse V6 Composite chevron geometry.
         */

        chevron.innerHTML =
            "⌄";


        trigger.append(
            label,
            chevron
        );


        root.appendChild(
            trigger
        );


        native.insertAdjacentElement(
            "afterend",
            root
        );


        const menu =
            document.createElement(
                "div"
            );


        menu.className =
            "fd-map-menu-v7";


        menu.hidden =
            true;


        menu.setAttribute(
            "role",
            "listbox"
        );


        document.body.appendChild(
            menu
        );


        function close() {

            menu.hidden =
                true;


            root.classList.remove(
                "open"
            );


            trigger.setAttribute(
                "aria-expanded",
                "false"
            );
        }


        function position() {

            if (menu.hidden) {
                return;
            }


            const rect =
                trigger
                    .getBoundingClientRect();


            menu.style.left =
                `${Math.round(
                    rect.left
                )}px`;


            menu.style.top =
                `${Math.round(
                    rect.bottom + 5
                )}px`;


            menu.style.width =
                `${Math.round(
                    rect.width
                )}px`;
        }


        function sync() {

            const selected =
                native.options[
                    native.selectedIndex
                ];


            label.textContent =
                selected
                ?
                selected.textContent
                :
                "Select a map...";


            trigger.disabled =
                Boolean(
                    native.disabled
                );


            menu
                .querySelectorAll(
                    ".fd-map-option-v7"
                )
                .forEach(
                    option => {

                        option.classList.toggle(
                            "selected",
                            option.dataset.value
                            ===
                            native.value
                        );
                    }
                );


            styleLikeComposite(
                trigger,
                menu,
                [
                    ...menu.querySelectorAll(
                        ".fd-map-option-v7"
                    )
                ]
            );
        }


        function rebuild() {

            menu.replaceChildren();


            for (
                const nativeOption
                of native.options
            ) {

                const option =
                    document.createElement(
                        "button"
                    );


                option.type =
                    "button";


                option.className =
                    "fd-map-option-v7";


                option.dataset.value =
                    nativeOption.value;


                option.textContent =
                    nativeOption.textContent;


                option.addEventListener(
                    "click",
                    () => {

                        native.value =
                            nativeOption.value;


                        native.dispatchEvent(
                            new Event(
                                "change",
                                {
                                    bubbles:
                                        true,
                                }
                            )
                        );


                        sync();

                        close();
                    }
                );


                menu.appendChild(
                    option
                );
            }


            sync();
        }


        trigger.addEventListener(
            "click",
            event => {

                event.preventDefault();


                if (
                    menu.hidden
                ) {

                    menu.hidden =
                        false;


                    root.classList.add(
                        "open"
                    );


                    trigger.setAttribute(
                        "aria-expanded",
                        "true"
                    );


                    position();

                } else {

                    close();
                }
            }
        );


        native.addEventListener(
            "change",
            sync
        );


        new MutationObserver(
            rebuild
        )
        .observe(
            native,
            {
                childList:
                    true,
            }
        );


        document.addEventListener(
            "pointerdown",
            event => {

                if (
                    root.contains(
                        event.target
                    )
                    ||
                    menu.contains(
                        event.target
                    )
                ) {
                    return;
                }


                close();
            }
        );


        window.addEventListener(
            "resize",
            position
        );


        window.addEventListener(
            "scroll",
            position,
            true
        );


        rebuild();


        /*
         * Refresh button next to this map selector.
         */

        const refresh =
            row
            ?.querySelector(
                "button"
            );


        if (refresh) {
            applyResetStyle(refresh);
        }
    }


    /* ========================================================
       PARTIAL DROPDOWN ARROW
       ======================================================== */

    function fixPartialArrow() {

        const label =
            document.querySelector(
                ".fd-partial-label-v6"
            );


        const chevron =
            document.querySelector(
                ".fd-partial-chevron-v6"
            );


        if (label) {

            label.style.setProperty(
                "flex",
                "1 1 auto",
                "important"
            );
        }


        if (chevron) {

            chevron.style.setProperty(
                "margin-left",
                "auto",
                "important"
            );
        }
    }


    /* ========================================================
       CENTER IDLE ART
       ======================================================== */



    function syncIdleTypography() {

        const heading =
            document.querySelector(
                ".empty-state > h3"
            );


        const ref =
            liveRefs()
                .rgbIdle;


        if (
            heading
            &&
            ref
        ) {

            copy(
                ref,
                heading,
                FONT
            );
        }
    }


    /* ========================================================
       BOOT
       ======================================================== */

    function syncEverything() {

        syncLiveGeometry();
        syncControllerStyle();
        syncMappingStatus();
        syncUtilityButtons();
        fixPartialArrow();
        syncIdleTypography();
    }


    function boot() {

        removeConnectionBlock();


        installMapDropdown();

        syncEverything();


        /*
         * Finite late passes only.
         * No repeating polling.
         */

        window.setTimeout(
            syncEverything,
            120
        );


        window.setTimeout(
            syncEverything,
            500
        );


        window.setTimeout(
            syncEverything,
            1100
        );
    }


    if (
        document.readyState
        ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once:
                    true,
            }
        );

    } else {

        boot();
    }

})();

/* ===== END full_dashboard_detail_v7.js ===== */

/* ===== BEGIN full_dashboard_detail_v8.js ===== */
/* ============================================================
   FULL_DASH_SLAM_DETAIL_JS_V8
   Presentation only.
   ============================================================ */

(() => {
    "use strict";


    const $ =
        id =>
            document.getElementById(id);


    const clean =
        value =>
            String(value || "")
                .replace(/\s+/g, " ")
                .trim();


    function pdoc() {

        try {

            if (
                window.parent
                &&
                window.parent !== window
            ) {
                return window.parent.document;
            }

        } catch (_) {
        }

        return null;
    }


    function cssName(name) {

        return name.replace(
            /[A-Z]/g,
            c => "-" + c.toLowerCase()
        );
    }


    function snapshotStyle(
        node,
        props,
        view = window
    ) {

        if (!node) {
            return null;
        }


        const style =
            view.getComputedStyle(node);


        const out = {};


        for (const prop of props) {

            const value =
                style[prop];


            if (
                value !== undefined
                &&
                value !== null
                &&
                value !== ""
            ) {
                out[prop] =
                    value;
            }
        }


        return out;
    }


    function applySnapshot(
        target,
        snapshot
    ) {

        if (
            !target
            ||
            !snapshot
        ) {
            return;
        }


        for (
            const [
                prop,
                value
            ]
            of Object.entries(
                snapshot
            )
        ) {

            target.style.setProperty(
                cssName(prop),
                value,
                "important"
            );
        }
    }


    function copyLocal(
        source,
        target,
        props
    ) {

        applySnapshot(
            target,
            snapshotStyle(
                source,
                props,
                window
            )
        );
    }


    const BUTTON_PROPS = [
        "height",
        "minHeight",

        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",

        "background",
        "backgroundColor",
        "backgroundImage",

        "borderTopWidth",
        "borderTopStyle",
        "borderTopColor",

        "borderRightWidth",
        "borderRightStyle",
        "borderRightColor",

        "borderBottomWidth",
        "borderBottomStyle",
        "borderBottomColor",

        "borderLeftWidth",
        "borderLeftStyle",
        "borderLeftColor",

        "borderRadius",
        "boxShadow",

        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "lineHeight",
        "letterSpacing",
        "textTransform",

        "color",

        "display",
        "alignItems",
        "justifyContent",
        "gap",
    ];


    const SURFACE_PROPS = [
        "background",
        "backgroundColor",
        "backgroundImage",

        "borderTopWidth",
        "borderTopStyle",
        "borderTopColor",

        "borderRightWidth",
        "borderRightStyle",
        "borderRightColor",

        "borderBottomWidth",
        "borderBottomStyle",
        "borderBottomColor",

        "borderLeftWidth",
        "borderLeftStyle",
        "borderLeftColor",

        "borderRadius",
        "boxShadow",
    ];


    const FONT_PROPS = [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "lineHeight",
        "letterSpacing",
        "textTransform",
        "color",
    ];


    /* ========================================================
       ACTIVE CONTROLLER STYLE SNAPSHOT
       ======================================================== */


    function activeControllerStyle() {

        const doc =
            pdoc();


        if (!doc) {
            return null;
        }


        const source =
            doc.getElementById(
                "controllerProcessSwitchV16"
            );


        if (!source) {
            return null;
        }


        /*
         * The real local Controller Process is disabled because
         * the robot backend is absent.
         *
         * Sample a temporary ENABLED visual clone instead.
         * No listeners are attached to the clone.
         */

        const clone =
            source.cloneNode(true);


        clone.style.position =
            "fixed";

        clone.style.left =
            "-20000px";

        clone.style.top =
            "0";

        clone.style.visibility =
            "hidden";

        clone.style.pointerEvents =
            "none";

        clone.style.zIndex =
            "-1";


        const configure =
            clone.querySelector(
                "#controllerConfigureBtn"
            );


        const stop =
            clone.querySelector(
                "#controllerStopBtn"
            );


        if (
            !configure
            ||
            !stop
        ) {
            return null;
        }


        configure.disabled =
            false;

        stop.disabled =
            false;


        doc.body.appendChild(
            clone
        );


        const view =
            window.parent;


        const result = {
            wrapper:
                snapshotStyle(
                    clone,
                    SURFACE_PROPS,
                    view
                ),

            configure:
                snapshotStyle(
                    configure,
                    BUTTON_PROPS,
                    view
                ),

            stop:
                snapshotStyle(
                    stop,
                    BUTTON_PROPS,
                    view
                ),
        };


        clone.remove();


        return result;
    }


    let cachedControllerStyle =
        null;


    function controllerStyle() {

        if (!cachedControllerStyle) {

            cachedControllerStyle =
                activeControllerStyle();
        }


        return cachedControllerStyle;
    }


    function syncMappingControllerV8() {

        const styles =
            controllerStyle();


        if (!styles) {
            return;
        }


        const start =
            $("start-map");


        const stop =
            $("stop-map");


        const pause =
            $("pause-map");


        const primary =
            document.querySelector(
                ".fd-map-primary-row-v5"
            );


        const secondary =
            document.querySelector(
                ".fd-map-secondary-row-v5"
            );


        if (
            !start
            ||
            !stop
            ||
            !pause
            ||
            !primary
            ||
            !secondary
        ) {
            return;
        }


        applySnapshot(
            primary,
            styles.wrapper
        );


        applySnapshot(
            secondary,
            styles.wrapper
        );


        applySnapshot(
            start,
            styles.configure
        );


        applySnapshot(
            stop,
            styles.stop
        );


        const resume =
            pause.classList.contains(
                "fd-map-resume-v5"
            )
            ||
            /\bresume\b/i.test(
                clean(
                    pause.textContent
                )
            );


        applySnapshot(
            pause,
            resume
                ?
                styles.configure
                :
                styles.stop
        );


        /*
         * Semantic colors requested for mapping.
         */

        start.style.setProperty(
            "color",
            "#8ecb7f",
            "important"
        );


        stop.style.setProperty(
            "color",
            "#d6a82d",
            "important"
        );


        pause.style.setProperty(
            "color",
            resume
                ?
                "#8ecb7f"
                :
                "#d6a82d",
            "important"
        );


        /*
         * Let the wrapper own the rounded outline.
         */

        start.style.setProperty(
            "border-radius",
            "0",
            "important"
        );


        stop.style.setProperty(
            "border-radius",
            "0",
            "important"
        );


        pause.style.setProperty(
            "border-radius",
            "0",
            "important"
        );


        start.style.setProperty(
            "width",
            "100%",
            "important"
        );


        stop.style.setProperty(
            "width",
            "100%",
            "important"
        );


        pause.style.setProperty(
            "width",
            "100%",
            "important"
        );
    }


    function watchPauseResumeStyle() {

        const pause =
            $("pause-map");


        if (!pause) {
            return;
        }


        let queued =
            false;


        const schedule =
            () => {

                if (queued) {
                    return;
                }


                queued =
                    true;


                requestAnimationFrame(
                    () => {

                        queued =
                            false;


                        syncMappingControllerV8();
                    }
                );
            };


        new MutationObserver(
            schedule
        )
        .observe(
            pause,
            {
                childList:
                    true,

                characterData:
                    true,

                subtree:
                    true,

                attributes:
                    true,

                attributeFilter: [
                    "class",
                ],
            }
        );
    }


    /* ========================================================
       WALK / CLIMB BUTTON STYLE
       ======================================================== */


    function walkButtonStyle() {

        const doc =
            pdoc();


        if (!doc) {
            return null;
        }


        const walk =
            doc.querySelector(
                '#liveRobotModesCard '
                +
                '[data-live-robot-mode="walk"]'
            )
            ||
            doc.querySelector(
                '#liveRobotModesCard '
                +
                '[data-live-robot-mode="climb"]'
            );


        return (
            snapshotStyle(
                walk,
                BUTTON_PROPS,
                window.parent
            )
        );
    }


    function syncModeStyleButtons() {

        const snapshot =
            walkButtonStyle();


        if (!snapshot) {
            return;
        }


        for (
            const id
            of [
                "view-partial",
                "download-partial",
                "view-map",
                "download-map",
                "clear-view",
                "car-view-map",
                "car-download-map",
                "car-clear-view",
            ]
        ) {

            const button =
                $(id);


            if (!button) {
                continue;
            }


            button.classList.add(
                "fd-mode-button-v8"
            );


            applySnapshot(
                button,
                snapshot
            );


            button.style.setProperty(
                "width",
                "100%",
                "important"
            );
        }
    }


    /* ========================================================
       REFRESH PARITY
       ======================================================== */


    function syncRefreshButtons() {

        const source =
            $("refresh-partials");


        const target =
            $("refresh-maps");


        if (
            !source
            ||
            !target
        ) {
            return;
        }


        copyLocal(
            source,
            target,
            BUTTON_PROPS
        );


        target.style.removeProperty(
            "width"
        );


        target.style.removeProperty(
            "min-width"
        );


        target.style.removeProperty(
            "max-width"
        );
    }


    /* ========================================================
       COMPOSITE DROPDOWN STYLE
       ======================================================== */


    function compositeRefs() {

        const doc =
            pdoc();


        if (!doc) {
            return {};
        }


        return {
            trigger:
                doc.querySelector(
                    "#stitchHealthDropdownV174 "
                    +
                    ".stitch-health-trigger-v174"
                ),

            chevron:
                doc.querySelector(
                    "#stitchHealthDropdownV174 "
                    +
                    ".stitch-health-chevron-v174"
                ),

            menu:
                doc.querySelector(
                    "body > "
                    +
                    ".stitch-health-menu-v174"
                ),

            option:
                doc.querySelector(
                    "body > "
                    +
                    ".stitch-health-menu-v174 "
                    +
                    ".stitch-health-option-v174"
                ),
        };
    }


    function syncOneComposite(
        trigger,
        chevron,
        menu,
        options
    ) {

        const refs =
            compositeRefs();


        if (
            trigger
            &&
            refs.trigger
        ) {

            applySnapshot(
                trigger,
                snapshotStyle(
                    refs.trigger,
                    BUTTON_PROPS,
                    window.parent
                )
            );


            trigger.style.setProperty(
                "position",
                "relative",
                "important"
            );


            trigger.style.setProperty(
                "width",
                "100%",
                "important"
            );


            trigger.style.setProperty(
                "min-width",
                "0",
                "important"
            );


            trigger.style.setProperty(
                "padding-right",
                "28px",
                "important"
            );
        }


        if (
            chevron
            &&
            refs.chevron
        ) {

            chevron.textContent =
                "";


            applySnapshot(
                chevron,
                snapshotStyle(
                    refs.chevron,
                    [
                        "width",
                        "height",

                        "borderTopWidth",
                        "borderTopStyle",
                        "borderTopColor",

                        "borderRightWidth",
                        "borderRightStyle",
                        "borderRightColor",

                        "borderBottomWidth",
                        "borderBottomStyle",
                        "borderBottomColor",

                        "borderLeftWidth",
                        "borderLeftStyle",
                        "borderLeftColor",

                        "color",
                    ],
                    window.parent
                )
            );


            chevron.style.setProperty(
                "position",
                "absolute",
                "important"
            );


            chevron.style.setProperty(
                "right",
                "10px",
                "important"
            );


            chevron.style.setProperty(
                "left",
                "auto",
                "important"
            );


            chevron.style.setProperty(
                "top",
                "50%",
                "important"
            );


            chevron.style.setProperty(
                "margin",
                "0",
                "important"
            );
        }


        if (
            menu
            &&
            refs.menu
        ) {

            applySnapshot(
                menu,
                snapshotStyle(
                    refs.menu,
                    [
                        ...SURFACE_PROPS,

                        "paddingTop",
                        "paddingRight",
                        "paddingBottom",
                        "paddingLeft",

                        "rowGap",
                        "columnGap",
                    ],
                    window.parent
                )
            );
        }


        if (refs.option) {

            const snap =
                snapshotStyle(
                    refs.option,
                    BUTTON_PROPS,
                    window.parent
                );


            for (
                const option
                of options
            ) {

                applySnapshot(
                    option,
                    snap
                );


                option.style.setProperty(
                    "width",
                    "100%",
                    "important"
                );


                option.style.setProperty(
                    "text-align",
                    "left",
                    "important"
                );
            }
        }
    }


    function syncCompositeDropdowns() {

        syncOneComposite(
            document.querySelector(
                ".fd-partial-trigger-v6"
            ),

            document.querySelector(
                ".fd-partial-chevron-v6"
            ),

            document.querySelector(
                ".fd-partial-menu-v6"
            ),

            [
                ...document.querySelectorAll(
                    ".fd-partial-option-v6"
                )
            ]
        );


        syncOneComposite(
            document.querySelector(
                ".fd-map-trigger-v7"
            ),

            document.querySelector(
                ".fd-map-chevron-v7"
            ),

            document.querySelector(
                ".fd-map-menu-v7"
            ),

            [
                ...document.querySelectorAll(
                    ".fd-map-option-v7"
                )
            ]
        );
    }


    function sanitizePartialSessionText() {

        const label =
            document.querySelector(
                ".fd-partial-label-v6"
            );


        if (
            label
            &&
            clean(
                label.textContent
            )
            .toLowerCase()
            .startsWith(
                "no saved sessions"
            )
        ) {

            label.textContent =
                "No saved sessions";
        }


        for (
            const option
            of document.querySelectorAll(
                ".fd-partial-option-v6"
            )
        ) {

            if (
                clean(
                    option.textContent
                )
                .toLowerCase()
                .startsWith(
                    "no saved sessions"
                )
            ) {

                option.textContent =
                    "No saved sessions";
            }
        }
    }


    function watchPartialSessionText() {

        const native =
            $("partial-sessions");


        if (!native) {
            return;
        }


        const sync =
            () =>
                queueMicrotask(
                    () => {

                        sanitizePartialSessionText();

                        syncCompositeDropdowns();
                    }
                );


        native.addEventListener(
            "change",
            sync
        );


        new MutationObserver(
            sync
        )
        .observe(
            native,
            {
                childList:
                    true,

                subtree:
                    true,
            }
        );
    }


    /* ========================================================
       INITIAL POSE TYPOGRAPHY / INPUTS
       ======================================================== */


    function liveStatusLabelStyle() {

        const doc =
            pdoc();


        if (!doc) {
            return null;
        }


        const status =
            doc.getElementById(
                "teleopStatusPanelV21"
            )
            ||
            [
                ...doc.querySelectorAll(
                    "#view-live .panel"
                )
            ]
            .find(
                panel =>
                    clean(
                        panel.textContent
                    )
                    .includes(
                        "Fault"
                    )
                    &&
                    clean(
                        panel.textContent
                    )
                    .includes(
                        "Inspire"
                    )
            );


        if (!status) {
            return null;
        }


        const label =
            [
                ...status.querySelectorAll(
                    "span"
                )
            ]
            .find(
                span =>
                    clean(
                        span.textContent
                    )
                    ===
                    "Xr"
            )
            ||
            [
                ...status.querySelectorAll(
                    "span"
                )
            ]
            .find(
                span =>
                    clean(
                        span.textContent
                    )
                    ===
                    "Fault"
            );


        return (
            snapshotStyle(
                label,
                FONT_PROPS,
                window.parent
            )
        );
    }


    function syncInitialPoseTypography() {

        const locX =
            $("loc-x");


        const locY =
            $("loc-y");


        const locYaw =
            $("loc-yaw");


        if (
            !locX
            ||
            !locY
            ||
            !locYaw
        ) {
            return;
        }


        const grid =
            locX.closest(
                ".field-grid"
            );


        const heading =
            grid
                ?.previousElementSibling;


        const snapshot =
            liveStatusLabelStyle();


        if (!snapshot) {
            return;
        }


        if (heading) {

            heading.classList.add(
                "fd-initial-pose-label-v8"
            );


            applySnapshot(
                heading,
                snapshot
            );
        }


        for (
            const input
            of [
                locX,
                locY,
                locYaw,
            ]
        ) {

            const label =
                input.closest(
                    "label"
                );


            if (!label) {
                continue;
            }


            label.classList.add(
                "fd-initial-coordinate-label-v8"
            );


            applySnapshot(
                label,
                snapshot
            );


            input.setAttribute(
                "inputmode",
                "decimal"
            );
        }
    }


    /* ========================================================
       TRANSIENT LIVE-LIKE SCROLL INDICATORS
       ======================================================== */


    function installScrollIndicator(
        rail
    ) {

        if (
            !rail
            ||
            rail.dataset
                .fdScrollV8
        ) {
            return;
        }


        rail.dataset.fdScrollV8 =
            "1";


        const panel =
            rail.closest(
                ".control-panel"
            );


        if (!panel) {
            return;
        }


        const track =
            document.createElement(
                "div"
            );


        track.className =
            "fd-rail-scroll-v8";


        const thumb =
            document.createElement(
                "div"
            );


        thumb.className =
            "fd-rail-scroll-thumb-v8";


        track.appendChild(
            thumb
        );


        panel.appendChild(
            track
        );


        let hideTimer =
            0;


        let raf =
            0;


        function update() {

            raf =
                0;


            const panelRect =
                panel.getBoundingClientRect();


            const railRect =
                rail.getBoundingClientRect();


            const top =
                Math.max(
                    0,
                    railRect.top
                    -
                    panelRect.top
                    +
                    5
                );


            const height =
                Math.max(
                    20,
                    rail.clientHeight
                    -
                    10
                );


            track.style.top =
                `${Math.round(
                    top
                )}px`;


            track.style.height =
                `${Math.round(
                    height
                )}px`;


            const maxScroll =
                Math.max(
                    0,
                    rail.scrollHeight
                    -
                    rail.clientHeight
                );


            if (
                maxScroll
                <=
                1
            ) {

                track.style.opacity =
                    "0";

                return;
            }


            const ratio =
                rail.clientHeight
                /
                rail.scrollHeight;


            const thumbHeight =
                Math.max(
                    30,
                    height
                    *
                    ratio
                );


            const travel =
                Math.max(
                    0,
                    height
                    -
                    thumbHeight
                );


            const progress =
                maxScroll
                >
                0
                ?
                rail.scrollTop
                /
                maxScroll
                :
                0;


            thumb.style.height =
                `${Math.round(
                    thumbHeight
                )}px`;


            thumb.style.transform =
                `translate3d(0,${
                    Math.round(
                        travel
                        *
                        progress
                    )
                }px,0)`;
        }


        function schedule() {

            if (!raf) {

                raf =
                    requestAnimationFrame(
                        update
                    );
            }
        }


        function showTransient() {

            schedule();


            track.classList.add(
                "active"
            );


            window.clearTimeout(
                hideTimer
            );


            hideTimer =
                window.setTimeout(
                    () => {

                        track.classList.remove(
                            "active"
                        );
                    },
                    620
                );
        }


        rail.addEventListener(
            "scroll",
            showTransient,
            {
                passive:
                    true,
            }
        );


        rail.addEventListener(
            "mouseenter",
            () => {

                schedule();

                track.classList.add(
                    "active"
                );
            }
        );


        rail.addEventListener(
            "mouseleave",
            () => {

                window.clearTimeout(
                    hideTimer
                );


                hideTimer =
                    window.setTimeout(
                        () => {

                            track.classList.remove(
                                "active"
                            );
                        },
                        260
                    );
            }
        );


        window.addEventListener(
            "resize",
            schedule
        );


        update();
    }


    function installSidebarScrolls() {

        document
            .querySelectorAll(
                ".control-panel "
                +
                "> .panel-scroll"
            )
            .forEach(
                installScrollIndicator
            );
    }


    /* ========================================================
       EXACT LIVE-STYLE MAJOR SECTION DRAG
       ======================================================== */


    const MAJOR_STORAGE =
        "full-dash-slam-major-order-v5";


    const FLIP_MS =
        290;


    const FLIP_EASE =
        "cubic-bezier(0.2, 0.85, 0.25, 1)";


    let majorDrag =
        null;


    let shell =
        null;


    const majorMap =
        new Map();


    function currentMajorOrder() {

        return [
            ...shell.children
        ]
        .filter(
            node =>
                node.dataset
                    .fdMajorV8
        )
        .map(
            node =>
                node.dataset
                    .fdMajorV8
        );
    }


    function captureMajorRects() {

        const result =
            new Map();


        for (
            const node
            of majorMap.values()
        ) {

            result.set(
                node,
                node
                    .getBoundingClientRect()
            );
        }


        return result;
    }


    function animateMajorFlip(
        before,
        excluded = null
    ) {

        for (
            const [
                node,
                oldRect
            ]
            of before
        ) {

            if (
                node === excluded
                ||
                !node.isConnected
            ) {
                continue;
            }


            const rect =
                node
                    .getBoundingClientRect();


            const dx =
                oldRect.left
                -
                rect.left;


            const dy =
                oldRect.top
                -
                rect.top;


            if (
                Math.abs(dx) < 1
                &&
                Math.abs(dy) < 1
            ) {
                continue;
            }


            try {

                node.animate(
                    [
                        {
                            transform:
                                `translate3d(${dx}px,${dy}px,0) scale(.985)`,
                        },
                        {
                            transform:
                                "translate3d(0,0,0) scale(1)",
                        },
                    ],
                    {
                        duration:
                            FLIP_MS,

                        easing:
                            FLIP_EASE,

                        fill:
                            "both",
                    }
                );

            } catch (_) {
            }
        }
    }


    function widthsByMajor() {

        const result = {};


        for (
            const [
                key,
                node
            ]
            of majorMap
        ) {

            result[key] =
                node
                    .getBoundingClientRect()
                    .width;
        }


        return result;
    }


    function applyMajorWidths(
        order,
        widths
    ) {

        shell.style.setProperty(
            "grid-template-columns",
            order
                .map(
                    key =>
                        `${Math.max(
                            1,
                            Math.round(
                                widths[key]
                            )
                        )}px`
                )
                .join(" "),
            "important"
        );
    }


    function appendMajorOrder(
        order
    ) {

        for (const key of order) {

            const node =
                majorMap.get(
                    key
                );


            if (node) {

                shell.appendChild(
                    node
                );
            }
        }
    }


    function desiredOrder(
        key,
        clientX
    ) {

        const others =
            currentMajorOrder()
                .filter(
                    item =>
                        item !== key
                );


        let index =
            0;


        for (
            const other
            of others
        ) {

            const rect =
                majorMap
                    .get(other)
                    .getBoundingClientRect();


            if (
                clientX
                >
                rect.left
                +
                rect.width
                /
                2
            ) {

                index += 1;
            }
        }


        const result = [
            ...others
        ];


        result.splice(
            index,
            0,
            key
        );


        return result;
    }


    function sameOrder(
        a,
        b
    ) {

        return (
            a.length === b.length
            &&
            a.every(
                (
                    value,
                    index
                ) =>
                    value === b[index]
            )
        );
    }


    function moveMajor(
        event
    ) {

        if (
            !majorDrag
            ||
            event.pointerId
                !==
                majorDrag.pointerId
        ) {
            return;
        }


        event.preventDefault();


        const targetLeft =
            event.clientX
            -
            majorDrag.grabOffset;


        majorDrag.dx =
            targetLeft
            -
            majorDrag.baseLeft;


        majorDrag.node.style
            .setProperty(
                "transform",
                `translate3d(${majorDrag.dx}px,0,0)`,
                "important"
            );


        const wanted =
            desiredOrder(
                majorDrag.key,
                event.clientX
            );


        if (
            sameOrder(
                wanted,
                majorDrag.order
            )
        ) {
            return;
        }


        const before =
            captureMajorRects();


        const visual =
            majorDrag.node
                .getBoundingClientRect();


        majorDrag.node.style
            .removeProperty(
                "transform"
            );


        appendMajorOrder(
            wanted
        );


        applyMajorWidths(
            wanted,
            majorDrag.widths
        );


        const base =
            majorDrag.node
                .getBoundingClientRect();


        majorDrag.baseLeft =
            base.left;


        majorDrag.dx =
            visual.left
            -
            base.left;


        majorDrag.node.style
            .setProperty(
                "transform",
                `translate3d(${majorDrag.dx}px,0,0)`,
                "important"
            );


        majorDrag.order = [
            ...wanted
        ];


        animateMajorFlip(
            before,
            majorDrag.node
        );
    }


    function endMajor(
        event
    ) {

        if (
            !majorDrag
            ||
            event.pointerId
                !==
                majorDrag.pointerId
        ) {
            return;
        }


        const state =
            majorDrag;


        document.body.classList.remove(
            "fd-major-drag-body-v8"
        );


        state.node.classList.remove(
            "fd-major-drag-node-v8"
        );


        state.handle.classList.remove(
            "fd-major-active-v8"
        );


        state.node.style.removeProperty(
            "transform"
        );


        try {

            state.handle.releasePointerCapture(
                state.pointerId
            );

        } catch (_) {
        }


        try {

            localStorage.setItem(
                MAJOR_STORAGE,
                JSON.stringify(
                    currentMajorOrder()
                )
            );

        } catch (_) {
        }


        window.removeEventListener(
            "pointermove",
            moveMajor,
            true
        );


        window.removeEventListener(
            "pointerup",
            endMajor,
            true
        );


        window.removeEventListener(
            "pointercancel",
            endMajor,
            true
        );


        majorDrag =
            null;
    }


    function beginMajor(
        event,
        key,
        node,
        handle
    ) {

        if (
            majorDrag
            ||
            event.button !== 0
        ) {
            return;
        }


        event.preventDefault();


        const rect =
            node
                .getBoundingClientRect();


        majorDrag = {
            pointerId:
                event.pointerId,

            key,

            node,

            handle,

            widths:
                widthsByMajor(),

            order:
                currentMajorOrder(),

            grabOffset:
                event.clientX
                -
                rect.left,

            baseLeft:
                rect.left,

            dx:
                0,
        };


        document.body.classList.add(
            "fd-major-drag-body-v8"
        );


        node.classList.add(
            "fd-major-drag-node-v8"
        );


        handle.classList.add(
            "fd-major-active-v8"
        );


        try {

            handle.setPointerCapture(
                event.pointerId
            );

        } catch (_) {
        }


        window.addEventListener(
            "pointermove",
            moveMajor,
            true
        );


        window.addEventListener(
            "pointerup",
            endMajor,
            true
        );


        window.addEventListener(
            "pointercancel",
            endMajor,
            true
        );
    }


    function liveHandleSnapshot() {

        const doc =
            pdoc();


        if (!doc) {
            return null;
        }


        const handle =
            doc.querySelector(
                '#view-live '
                +
                '[aria-label^="Drag "]'
                +
                '[aria-label$=" section"]'
            );


        return (
            snapshotStyle(
                handle,
                [
                    "width",
                    "height",
                    "background",
                    "backgroundColor",
                    "backgroundImage",

                    "borderTopWidth",
                    "borderTopStyle",
                    "borderTopColor",

                    "borderRightWidth",
                    "borderRightStyle",
                    "borderRightColor",

                    "borderBottomWidth",
                    "borderBottomStyle",
                    "borderBottomColor",

                    "borderLeftWidth",
                    "borderLeftStyle",
                    "borderLeftColor",

                    "borderRadius",
                    "boxShadow",
                    "opacity",
                ],
                window.parent
            )
        );
    }


    function installMajorHandles() {

        shell =
            document.querySelector(
                ".app-shell"
            );


        if (!shell) {
            return;
        }


        document
            .querySelectorAll(
                ".fd-slam-major-handle-v5,"
                +
                ".fd-slam-major-handle-v8"
            )
            .forEach(
                node =>
                    node.remove()
            );


        const robot =
            shell.querySelector(
                ":scope > "
                +
                ".control-panel"
                +
                ":not(.car-side)"
            );


        const map =
            shell.querySelector(
                ":scope > "
                +
                ".workspace"
            );


        const car =
            shell.querySelector(
                ":scope > "
                +
                ".control-panel"
                +
                ".car-side"
            );


        const defs = [
            [
                "robot",
                robot,
                "Robot navigation",
            ],
            [
                "map",
                map,
                "Map workspace",
            ],
            [
                "car",
                car,
                "Car navigation",
            ],
        ];


        const handleStyle =
            liveHandleSnapshot();


        for (
            const [
                key,
                node,
                label
            ]
            of defs
        ) {

            if (!node) {
                continue;
            }


            node.dataset.fdMajorV8 =
                key;


            majorMap.set(
                key,
                node
            );


            const handle =
                document.createElement(
                    "button"
                );


            handle.type =
                "button";


            handle.className =
                "fd-slam-major-handle-v8";


            handle.setAttribute(
                "aria-label",
                `Drag ${label} section`
            );


            handle.title =
                `Drag ${label} section`;


            applySnapshot(
                handle,
                handleStyle
            );


            /*
             * Never inherit display/position from the sampled
             * handle; V8 owns those so the bars stay visible.
             */

            handle.style.setProperty(
                "display",
                "block",
                "important"
            );


            handle.style.setProperty(
                "position",
                "absolute",
                "important"
            );


            handle.addEventListener(
                "pointerdown",
                event =>
                    beginMajor(
                        event,
                        key,
                        node,
                        handle
                    )
            );


            node.appendChild(
                handle
            );
        }
    }


    /* ========================================================
       COMPLEX IDLE ART
       ======================================================== */




    /* ========================================================
       BOOT
       ======================================================== */


    function syncVisualParity() {

        syncMappingControllerV8();

        syncModeStyleButtons();

        syncRefreshButtons();

        syncCompositeDropdowns();

        sanitizePartialSessionText();

        syncInitialPoseTypography();
    }


    function boot() {

        installSidebarScrolls();

        installMajorHandles();


        watchPauseResumeStyle();

        watchPartialSessionText();

        syncVisualParity();


        window.setTimeout(
            syncVisualParity,
            150
        );


        window.setTimeout(
            syncVisualParity,
            600
        );


        window.setTimeout(
            syncVisualParity,
            1200
        );
    }


    if (
        document.readyState
        ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once:
                    true,
            }
        );

    } else {

        boot();
    }

})();

/* ===== END full_dashboard_detail_v8.js ===== */

/* ===== BEGIN full_dashboard_polish_v13.js ===== */
/* ============================================================
   FULL_DASH_SLAM_POLISH_JS_V13

   One consolidated presentation owner.

   IMPORTANT:
   - original buttons remain functional authorities
   - original selects remain functional authorities
   - no MutationObserver
   - no setInterval
   - no repeated DOM rebuilding
   ============================================================ */

(() => {
    "use strict";


    const $ =
        id =>
            document.getElementById(id);


    /* ========================================================
       MAPPING PROXY CONTROLS
       ======================================================== */

    let mappingUi =
        null;


    function iconDiamond() {

        return `
          <span class="fd13-segment-icon" aria-hidden="true">
            <svg viewBox="0 0 12 12">
              <path d="M6 1.8 10.2 6 6 10.2 1.8 6Z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.3"/>
            </svg>
          </span>
        `;
    }


    function iconStop() {

        return `
          <span class="fd13-segment-icon" aria-hidden="true">
            <svg viewBox="0 0 12 12">
              <path d="M3 3 9 9M9 3 3 9"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"/>
            </svg>
          </span>
        `;
    }


    function iconPause() {

        return `
          <span class="fd13-segment-icon" aria-hidden="true">
            <svg viewBox="0 0 12 12">
              <rect x="2.3" y="1.8" width="2.5" height="8.4" rx=".6"/>
              <rect x="7.2" y="1.8" width="2.5" height="8.4" rx=".6"/>
            </svg>
          </span>
        `;
    }


    function iconPlay() {

        return `
          <span class="fd13-segment-icon" aria-hidden="true">
            <svg viewBox="0 0 12 12">
              <path d="M3.1 1.8 10 6 3.1 10.2Z"/>
            </svg>
          </span>
        `;
    }


    function makeProxyButton(
        className,
        html,
        aria
    ) {

        const button =
            document.createElement(
                "button"
            );


        button.type =
            "button";


        button.className =
            "fd13-segment-button "
            +
            className;


        button.innerHTML =
            html;


        button.setAttribute(
            "aria-label",
            aria
        );


        return button;
    }


    function buildMappingUi() {

        if (mappingUi) {
            return mappingUi;
        }


        const start =
            $("start-map");


        const stop =
            $("stop-map");


        const pause =
            $("pause-map");


        if (
            !start
            ||
            !stop
            ||
            !pause
        ) {
            return null;
        }


        const body =
            start.closest(
                ".card-body"
            );


        if (!body) {
            return null;
        }


        const root =
            document.createElement(
                "div"
            );


        root.id =
            "fd13MappingControls";


        root.className =
            "fd13-mapping-controls";


        const primary =
            document.createElement(
                "div"
            );


        primary.className =
            "fd13-segment-switch";


        primary.dataset.active =
            "left";


        primary.dataset.tone =
            "green";


        const primaryIndicator =
            document.createElement(
                "span"
            );


        primaryIndicator.className =
            "fd13-segment-indicator";


        primaryIndicator.setAttribute(
            "aria-hidden",
            "true"
        );


        const startProxy =
            makeProxyButton(
                "green",
                iconDiamond()
                +
                "<span>Start mapping</span>",
                "Start mapping"
            );


        const stopProxy =
            makeProxyButton(
                "amber inactive",
                iconStop()
                +
                "<span>Stop</span>",
                "Stop mapping"
            );


        primary.append(
            primaryIndicator,
            startProxy,
            stopProxy
        );


        const secondary =
            document.createElement(
                "div"
            );


        secondary.className =
            "fd13-segment-switch";


        secondary.dataset.active =
            "left";


        secondary.dataset.tone =
            "amber";


        const secondaryIndicator =
            document.createElement(
                "span"
            );


        secondaryIndicator.className =
            "fd13-segment-indicator";


        secondaryIndicator.setAttribute(
            "aria-hidden",
            "true"
        );


        const pauseProxy =
            makeProxyButton(
                "amber",
                iconPause()
                +
                "<span>Pause</span>",
                "Pause mapping"
            );


        const resumeProxy =
            makeProxyButton(
                "green inactive",
                iconPlay()
                +
                "<span>Resume</span>",
                "Resume mapping"
            );


        secondary.append(
            secondaryIndicator,
            pauseProxy,
            resumeProxy
        );


        root.append(
            primary,
            secondary
        );


        body.insertBefore(
            root,
            body.firstChild
        );


        startProxy.addEventListener(
            "click",
            () => {

                if (!start.disabled) {
                    start.click();
                }
            }
        );


        stopProxy.addEventListener(
            "click",
            () => {

                if (!stop.disabled) {
                    stop.click();
                }
            }
        );


        pauseProxy.addEventListener(
            "click",
            () => {

                const paused =
                    pause.dataset
                        .slamPauseState
                    ===
                    "resume";


                if (
                    !pause.disabled
                    &&
                    !paused
                ) {
                    pause.click();
                }
            }
        );


        resumeProxy.addEventListener(
            "click",
            () => {

                const paused =
                    pause.dataset
                        .slamPauseState
                    ===
                    "resume";


                if (
                    !pause.disabled
                    &&
                    paused
                ) {
                    pause.click();
                }
            }
        );


        mappingUi = {
            start,
            stop,
            pause,

            primary,
            secondary,

            startProxy,
            stopProxy,
            pauseProxy,
            resumeProxy,
        };


        return mappingUi;
    }


    function setInactive(
        button,
        inactive
    ) {

        button.classList.toggle(
            "inactive",
            inactive
        );
    }


    function syncMapping() {

        const ui =
            buildMappingUi();


        if (!ui) {
            return;
        }


        const mappingActive =
            !!ui.start.disabled;


        const paused =
            ui.pause.dataset
                .slamPauseState
            ===
            "resume";


        ui.primary.dataset.active =
            mappingActive
            ?
            "right"
            :
            "left";


        ui.primary.dataset.tone =
            mappingActive
            ?
            "amber"
            :
            "green";


        setInactive(
            ui.startProxy,
            mappingActive
        );


        setInactive(
            ui.stopProxy,
            !mappingActive
        );


        ui.startProxy.disabled =
            !!ui.start.disabled;


        ui.stopProxy.disabled =
            !!ui.stop.disabled;


        ui.secondary.dataset.active =
            paused
            ?
            "right"
            :
            "left";


        ui.secondary.dataset.tone =
            paused
            ?
            "green"
            :
            "amber";


        setInactive(
            ui.pauseProxy,
            paused
        );


        setInactive(
            ui.resumeProxy,
            !paused
        );


        ui.pauseProxy.disabled =
            !!ui.pause.disabled
            ||
            paused;


        ui.resumeProxy.disabled =
            !!ui.pause.disabled
            ||
            !paused;


        ui.startProxy.setAttribute(
            "aria-pressed",
            String(
                !mappingActive
            )
        );


        ui.stopProxy.setAttribute(
            "aria-pressed",
            String(
                mappingActive
            )
        );


        ui.pauseProxy.setAttribute(
            "aria-pressed",
            String(
                !paused
            )
        );


        ui.resumeProxy.setAttribute(
            "aria-pressed",
            String(
                paused
            )
        );
    }


    /*
     * app.js calls this after the real SLAM state is rendered.
     */
    window.fullDashSyncMappingV13 =
        syncMapping;


    /* ========================================================
       ALL DROPDOWNS — COMPOSITE-LIKE PRESENTATION
       ======================================================== */

    const dropdowns =
        [];


    let openDropdown =
        null;


    function cleanOptionText(
        value
    ) {

        return String(
            value
            ||
            ""
        )
        .replace(
            /(?:\.\.\.|…)\s*$/,
            ""
        )
        .trim();
    }


    function closeDropdown(
        control
    ) {

        if (!control) {
            return;
        }


        control.root.classList.remove(
            "open"
        );


        control.menu.classList.remove(
            "open"
        );


        control.trigger.setAttribute(
            "aria-expanded",
            "false"
        );


        if (
            openDropdown
            ===
            control
        ) {

            openDropdown =
                null;
        }
    }


    function positionDropdown(
        control
    ) {

        if (
            !control
            ||
            !control.root.classList.contains(
                "open"
            )
        ) {
            return;
        }


        const rect =
            control.trigger
                .getBoundingClientRect();


        control.menu.style.left =
            `${Math.round(
                rect.left
            )}px`;


        control.menu.style.top =
            `${Math.round(
                rect.bottom
                +
                5
            )}px`;


        control.menu.style.width =
            `${Math.round(
                rect.width
            )}px`;
    }


    function syncDropdown(
        control
    ) {

        const select =
            control.select;


        const option =
            select.options[
                select.selectedIndex
            ];


        control.label.textContent =
            cleanOptionText(
                option
                ?
                option.textContent
                :
                ""
            );


        control.trigger.disabled =
            !!select.disabled;


        for (
            const button
            of control.menu
                .querySelectorAll(
                    ".fd13-select-option"
                )
        ) {

            const selected =
                button.dataset.value
                ===
                select.value;


            button.classList.toggle(
                "selected",
                selected
            );


            button.setAttribute(
                "aria-selected",
                selected
                ?
                "true"
                :
                "false"
            );
        }
    }


    function rebuildDropdownMenu(
        control
    ) {

        control.menu.replaceChildren();


        for (
            const option
            of control.select.options
        ) {

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "fd13-select-option";


            button.dataset.value =
                option.value;


            button.textContent =
                cleanOptionText(
                    option.textContent
                );


            button.disabled =
                !!option.disabled;


            button.setAttribute(
                "role",
                "option"
            );


            button.addEventListener(
                "click",
                () => {

                    if (
                        button.disabled
                    ) {
                        return;
                    }


                    if (
                        control.select.value
                        !==
                        option.value
                    ) {

                        control.select.value =
                            option.value;


                        control.select
                            .dispatchEvent(
                                new Event(
                                    "change",
                                    {
                                        bubbles:
                                            true,
                                    }
                                )
                            );
                    }


                    syncDropdown(
                        control
                    );


                    closeDropdown(
                        control
                    );


                    control.trigger.focus();
                }
            );


            control.menu.appendChild(
                button
            );
        }


        syncDropdown(
            control
        );
    }


    function openSelect(
        control
    ) {

        syncDropdown(
            control
        );


        if (
            control.trigger.disabled
        ) {
            return;
        }


        if (
            openDropdown
            &&
            openDropdown !== control
        ) {

            closeDropdown(
                openDropdown
            );
        }


        rebuildDropdownMenu(
            control
        );


        control.root.classList.add(
            "open"
        );


        control.menu.classList.add(
            "open"
        );


        control.trigger.setAttribute(
            "aria-expanded",
            "true"
        );


        openDropdown =
            control;


        positionDropdown(
            control
        );
    }


    function initDropdown(
        select,
        index
    ) {

        if (
            !select
            ||
            select.dataset.fd13Ready
        ) {
            return;
        }


        select.dataset.fd13Ready =
            "1";


        select.classList.add(
            "fd13-native-select"
        );


        const root =
            document.createElement(
                "div"
            );


        root.className =
            "fd13-select";


        root.dataset.fd13Select =
            select.id
            ||
            String(index);


        const trigger =
            document.createElement(
                "button"
            );


        trigger.type =
            "button";


        trigger.className =
            "fd13-select-trigger";


        trigger.setAttribute(
            "aria-haspopup",
            "listbox"
        );


        trigger.setAttribute(
            "aria-expanded",
            "false"
        );


        const label =
            document.createElement(
                "span"
            );


        label.className =
            "fd13-select-label";


        const chevron =
            document.createElement(
                "span"
            );


        chevron.className =
            "fd13-select-chevron";


        chevron.setAttribute(
            "aria-hidden",
            "true"
        );


        trigger.append(
            label,
            chevron
        );


        root.appendChild(
            trigger
        );


        select.insertAdjacentElement(
            "afterend",
            root
        );


        const menu =
            document.createElement(
                "div"
            );


        menu.className =
            "fd13-select-menu";


        menu.setAttribute(
            "role",
            "listbox"
        );


        document.body.appendChild(
            menu
        );


        const control = {
            select,
            root,
            trigger,
            label,
            menu,
        };


        dropdowns.push(
            control
        );


        trigger.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();


                if (
                    root.classList.contains(
                        "open"
                    )
                ) {

                    closeDropdown(
                        control
                    );

                }

                else {

                    openSelect(
                        control
                    );
                }
            }
        );


        trigger.addEventListener(
            "keydown",
            event => {

                if (
                    event.key
                    ===
                    "Escape"
                ) {

                    closeDropdown(
                        control
                    );


                    return;
                }


                if (
                    event.key
                    ===
                    "Enter"
                    ||
                    event.key
                    ===
                    " "
                    ||
                    event.key
                    ===
                    "ArrowDown"
                    ||
                    event.key
                    ===
                    "ArrowUp"
                ) {

                    event.preventDefault();


                    openSelect(
                        control
                    );


                    const buttons =
                        [
                            ...menu.querySelectorAll(
                                ".fd13-select-option:not(:disabled)"
                            )
                        ];


                    if (
                        event.key
                        ===
                        "ArrowDown"
                        ||
                        event.key
                        ===
                        "ArrowUp"
                    ) {

                        const current =
                            Math.max(
                                0,
                                buttons.findIndex(
                                    button =>
                                        button.dataset.value
                                        ===
                                        select.value
                                )
                            );


                        buttons[
                            current
                        ]?.focus();
                    }
                }
            }
        );


        menu.addEventListener(
            "keydown",
            event => {

                const buttons =
                    [
                        ...menu.querySelectorAll(
                            ".fd13-select-option:not(:disabled)"
                        )
                    ];


                const current =
                    buttons.indexOf(
                        document.activeElement
                    );


                if (
                    event.key
                    ===
                    "Escape"
                ) {

                    event.preventDefault();


                    closeDropdown(
                        control
                    );


                    trigger.focus();


                    return;
                }


                if (
                    event.key
                    ===
                    "ArrowDown"
                    ||
                    event.key
                    ===
                    "ArrowUp"
                ) {

                    event.preventDefault();


                    const step =
                        event.key
                        ===
                        "ArrowDown"
                        ?
                        1
                        :
                        -1;


                    const next =
                        (
                            current
                            +
                            step
                            +
                            buttons.length
                        )
                        %
                        buttons.length;


                    buttons[
                        next
                    ]?.focus();
                }
            }
        );


        select.addEventListener(
            "change",
            () =>
                syncDropdown(
                    control
                )
        );


        syncDropdown(
            control
        );
    }


    function initDropdowns() {

        [
            ...document.querySelectorAll(
                "select"
            )
        ]
        .forEach(
            initDropdown
        );


        document.addEventListener(
            "pointerdown",
            event => {

                if (
                    !openDropdown
                ) {
                    return;
                }


                if (
                    openDropdown.root.contains(
                        event.target
                    )
                    ||
                    openDropdown.menu.contains(
                        event.target
                    )
                ) {
                    return;
                }


                closeDropdown(
                    openDropdown
                );
            }
        );


        window.addEventListener(
            "resize",
            () =>
                positionDropdown(
                    openDropdown
                )
        );


        window.addEventListener(
            "scroll",
            () =>
                positionDropdown(
                    openDropdown
                ),
            true
        );
    }


    /* ========================================================
       RANGE CONTROLS
       ======================================================== */

    function syncRange(
        input
    ) {

        const min =
            Number(
                input.min
                ||
                0
            );


        const max =
            Number(
                input.max
                ||
                100
            );


        const value =
            Number(
                input.value
            );


        const pct =
            (
                Number.isFinite(
                    value
                )
                &&
                max > min
            )
            ?
            Math.max(
                0,
                Math.min(
                    100,
                    (
                        (
                            value - min
                        )
                        /
                        (
                            max - min
                        )
                    )
                    *
                    100
                )
            )
            :
            0;


        input.style.setProperty(
            "--fd13-fill",
            `${pct}%`
        );
    }


    function initRanges() {

        for (
            const input
            of document.querySelectorAll(
                'input[type="range"]'
            )
        ) {

            input.classList.add(
                "fd13-range"
            );


            syncRange(
                input
            );


            input.addEventListener(
                "input",
                () =>
                    syncRange(
                        input
                    )
            );


            input.addEventListener(
                "change",
                () =>
                    syncRange(
                        input
                    )
            );
        }
    }


    /* ========================================================
       LABELS / NUMBER INPUTS / ORIENTATION BUTTONS
       ======================================================== */

    function initTypography() {

        for (
            const label
            of document.querySelectorAll(
                "label"
            )
        ) {

            if (
                label.querySelector(
                    'input[type="number"]'
                )
            ) {

                label.classList.add(
                    "fd13-number-label"
                );
            }
        }


        for (
            const button
            of document.querySelectorAll(
                "button"
            )
        ) {

            const text =
                String(
                    button.textContent
                    ||
                    ""
                ).trim();


            if (
                /-?\d+\s*°/.test(
                    text
                )
            ) {

                const stripped =
                    text
                        .replace(
                            /^[\u2190-\u21ff]+\s*/,
                            ""
                        )
                        .trim();


                button.textContent =
                    stripped;


                button.classList.add(
                    "fd13-angle-preset"
                );
            }
        }
    }


    /* ========================================================
       LARGE CENTRAL IDLE ART
       ======================================================== */



    /* ========================================================
       BOOT
       ======================================================== */

    function boot() {

        buildMappingUi();

        syncMapping();

        initDropdowns();

        initRanges();

        initTypography();

    }


    if (
        document.readyState
        ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once: true,
            }
        );

    }

    else {

        boot();
    }

})();

/* ===== END full_dashboard_polish_v13.js ===== */

/* ===== BEGIN full_dashboard_cleanup_v14.js ===== */
/* ============================================================
   FULL_DASH_CLEANUP_JS_V14

   One-shot visual cleanup.
   No MutationObserver.
   No setInterval.
   ============================================================ */

(() => {
    "use strict";


    function syncRange(
        input
    ) {

        const min =
            Number(
                input.min
                ||
                0
            );


        const max =
            Number(
                input.max
                ||
                100
            );


        const value =
            Number(
                input.value
            );


        const pct =
            max > min
            ?
            Math.max(
                0,
                Math.min(
                    100,
                    (
                        (
                            value - min
                        )
                        /
                        (
                            max - min
                        )
                    )
                    *
                    100
                )
            )
            :
            0;


        input.style.setProperty(
            "--fd14-fill",
            `${pct}%`
        );
    }


    function setupRanges() {

        for (
            const input
            of document.querySelectorAll(
                'input[type="range"]'
            )
        ) {

            input.classList.add(
                "fd14-range"
            );


            syncRange(
                input
            );


            input.addEventListener(
                "input",
                () =>
                    syncRange(
                        input
                    )
            );


            input.addEventListener(
                "change",
                () =>
                    syncRange(
                        input
                    )
            );
        }
    }


    function matchRefreshButtons() {

        const top =
            document.getElementById(
                "refresh-partials"
            );


        const bottom =
            document.getElementById(
                "refresh-maps"
            );


        if (
            top
            &&
            bottom
        ) {

            /*
             * Same visual/icon.
             * Keep bottom button itself so its existing
             * refresh-maps event listener remains attached.
             */

            bottom.innerHTML =
                top.innerHTML;


            bottom.setAttribute(
                "aria-label",
                top.getAttribute(
                    "aria-label"
                )
                ||
                "Refresh"
            );
        }
    }




    function removeRequestedHelpText() {

        const starts = [
            "after enabling",
            "changing mode affects",
            "după activare",
            "dupa activare",
            "schimbarea modului",
            "move the robot slowly",
        ];


        for (
            const node
            of document.querySelectorAll(
                "p.help"
            )
        ) {

            const text =
                String(
                    node.textContent
                    ||
                    ""
                )
                .trim()
                .toLowerCase();


            if (
                starts.some(
                    prefix =>
                        text.startsWith(
                            prefix
                        )
                )
            ) {

                node.classList.add(
                    "fd14-hidden-help"
                );
            }
        }
    }


    function boot() {

        setupRanges();

        matchRefreshButtons();


        removeRequestedHelpText();
    }


    if (
        document.readyState
        ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once:
                    true,
            }
        );

    }

    else {

        boot();
    }

})();

/* ===== END full_dashboard_cleanup_v14.js ===== */

/* ===== BEGIN full_dashboard_exact_controls_v15.js ===== */
/* ============================================================
   FULL_DASH_EXACT_CONTROLS_JS_V15

   No MutationObserver.
   No setInterval.
   Real original controls remain functional authorities.
   ============================================================ */

(() => {
    "use strict";


    const $ =
        id =>
            document.getElementById(id);


    let lastState =
        null;


    /* ========================================================
       SHARED SWITCH BUILDER
       ======================================================== */

    function makeIcon(
        type
    ) {

        const icon =
            document.createElement(
                "span"
            );


        icon.className =
            `fd15-icon fd15-icon-${type}`;


        icon.setAttribute(
            "aria-hidden",
            "true"
        );


        return icon;
    }


    function makeSegment(
        side,
        label,
        iconType
    ) {

        const button =
            document.createElement(
                "button"
            );


        button.type =
            "button";


        button.className =
            `fd15-live-segment fd15-${side}`;


        if (iconType) {

            button.appendChild(
                makeIcon(
                    iconType
                )
            );
        }


        const text =
            document.createElement(
                "span"
            );


        text.textContent =
            label;


        button.appendChild(
            text
        );


        return button;
    }


    function makeSwitch(
        leftLabel,
        rightLabel,
        leftIcon,
        rightIcon
    ) {

        const shell =
            document.createElement(
                "div"
            );


        shell.className =
            "fd15-live-switch";


        shell.dataset.side =
            "left";


        shell.dataset.mode =
            "left-green";


        const indicator =
            document.createElement(
                "span"
            );


        indicator.className =
            "fd15-live-indicator";


        indicator.setAttribute(
            "aria-hidden",
            "true"
        );


        const left =
            makeSegment(
                "left",
                leftLabel,
                leftIcon
            );


        const right =
            makeSegment(
                "right",
                rightLabel,
                rightIcon
            );


        shell.append(
            indicator,
            left,
            right
        );


        return {
            shell,
            left,
            right,
        };
    }


    function setSwitchState(
        control,
        side,
        mode
    ) {

        control.shell.dataset.side =
            side;


        control.shell.dataset.mode =
            mode;
    }


    /* ========================================================
       MAPPING
       ======================================================== */

    let mappingUi =
        null;


    function hideOldMappingControls(
        mappingCard
    ) {

        if (!mappingCard) {
            return;
        }


        const keep =
            mappingCard.querySelector(
                "#fd15MappingControls"
            );


        const candidates =
            [
                "#fd13MappingControls",
                ".fd-map-primary-row-v5",
                ".fd-map-secondary-row-v5",
                ".mapping-actions",
                "#start-map",
                "#stop-map",
                "#pause-map",
            ];


        for (
            const selector
            of candidates
        ) {

            for (
                const node
                of mappingCard
                    .querySelectorAll(
                        selector
                    )
            ) {

                if (
                    keep
                    &&
                    keep.contains(
                        node
                    )
                ) {
                    continue;
                }


                node.classList.add(
                    "fd15-retired-control"
                );


                node.style.setProperty(
                    "display",
                    "none",
                    "important"
                );
            }
        }


        /*
         * Catch any remaining historical generated row based on
         * text, but ONLY inside the Mapping card.
         */

        for (
            const row
            of mappingCard
                .querySelectorAll(
                    ".button-row, "
                    +
                    "[class*='map-primary'], "
                    +
                    "[class*='map-secondary']"
                )
        ) {

            if (
                row.closest(
                    "#fd15MappingControls"
                )
            ) {
                continue;
            }


            const text =
                String(
                    row.textContent
                    ||
                    ""
                )
                .replace(
                    /\s+/g,
                    " "
                )
                .trim()
                .toLowerCase();


            if (
                (
                    text.includes(
                        "start mapping"
                    )
                    &&
                    text.includes(
                        "stop"
                    )
                )
                ||
                (
                    text.includes(
                        "pause"
                    )
                    &&
                    text.length < 40
                )
            ) {

                row.classList.add(
                    "fd15-retired-control"
                );


                row.style.setProperty(
                    "display",
                    "none",
                    "important"
                );
            }
        }
    }


    function buildMapping() {

        if (mappingUi) {
            return mappingUi;
        }


        const start =
            $("start-map");


        const stop =
            $("stop-map");


        const pause =
            $("pause-map");


        if (
            !start
            ||
            !stop
            ||
            !pause
        ) {
            return null;
        }


        const card =
            start.closest(
                ".control-card"
            )
            ||
            start.closest(
                ".card-body"
            )?.parentElement;


        const body =
            start.closest(
                ".card-body"
            );


        if (
            !card
            ||
            !body
        ) {
            return null;
        }


        const root =
            document.createElement(
                "div"
            );


        root.id =
            "fd15MappingControls";


        root.className =
            "fd15-control-stack";


        const run =
            makeSwitch(
                "Start mapping",
                "Stop",
                "start",
                "stop"
            );


        const pauseResume =
            makeSwitch(
                "Pause",
                "Resume",
                "pause",
                "play"
            );


        root.append(
            run.shell,
            pauseResume.shell
        );


        body.prepend(
            root
        );


        run.left.addEventListener(
            "click",
            () => {

                if (!start.disabled) {
                    start.click();
                }
            }
        );


        run.right.addEventListener(
            "click",
            () => {

                if (!stop.disabled) {
                    stop.click();
                }
            }
        );


        pauseResume.left.addEventListener(
            "click",
            () => {

                const paused =
                    pause.dataset
                        .slamPauseState
                    ===
                    "resume";


                if (
                    !pause.disabled
                    &&
                    !paused
                ) {

                    pause.click();
                }
            }
        );


        pauseResume.right.addEventListener(
            "click",
            () => {

                const paused =
                    pause.dataset
                        .slamPauseState
                    ===
                    "resume";


                if (
                    !pause.disabled
                    &&
                    paused
                ) {

                    pause.click();
                }
            }
        );


        mappingUi = {
            start,
            stop,
            pause,
            card,
            run,
            pauseResume,
        };


        hideOldMappingControls(
            card
        );


        return mappingUi;
    }


    function syncMapping() {

        const ui =
            buildMapping();


        if (!ui) {
            return;
        }


        hideOldMappingControls(
            ui.card
        );


        const active =
            ui.start.disabled
            &&
            !ui.stop.disabled;


        if (active) {

            setSwitchState(
                ui.run,
                "right",
                "right-amber"
            );

        }

        else {

            setSwitchState(
                ui.run,
                "left",
                "left-green"
            );
        }


        ui.run.left.disabled =
            !!ui.start.disabled;


        ui.run.right.disabled =
            !!ui.stop.disabled;


        const paused =
            ui.pause.dataset
                .slamPauseState
            ===
            "resume";


        if (paused) {

            setSwitchState(
                ui.pauseResume,
                "right",
                "right-green"
            );

        }

        else {

            setSwitchState(
                ui.pauseResume,
                "left",
                "left-amber"
            );
        }


        ui.pauseResume.left.disabled =
            !!ui.pause.disabled
            ||
            paused;


        ui.pauseResume.right.disabled =
            !!ui.pause.disabled
            ||
            !paused;
    }


    /* ========================================================
       NAVIGATION
       ======================================================== */

    let navigationUi =
        null;


    function navigationRunning(
        next
    ) {

        const n =
            next?.navigation
            ||
            {};


        const directFlags = [
            n.active,
            n.running,
            n.navigating,
            n.goal_active,
            n.navigation_active,
        ];


        if (
            directFlags.some(
                value =>
                    value === true
            )
        ) {
            return true;
        }


        const state =
            String(
                n.state
                ||
                n.status
                ||
                ""
            )
            .toLowerCase();


        return /running|active|navigat|moving|execut/.test(
            state
        );
    }


    function navigationPaused(
        next
    ) {

        const n =
            next?.navigation
            ||
            {};


        if (
            n.paused === true
            ||
            n.is_paused === true
        ) {
            return true;
        }


        const state =
            String(
                n.state
                ||
                n.status
                ||
                ""
            )
            .toLowerCase();


        return state.includes(
            "pause"
        );
    }


    function buildNavigation() {

        if (navigationUi) {
            return navigationUi;
        }


        const start =
            $("navigate");


        const stop =
            $("stop-navigation");


        const pause =
            $("pause");


        const resume =
            $("resume");


        const preview =
            $("preview-route");


        if (
            !start
            ||
            !stop
            ||
            !pause
            ||
            !resume
            ||
            !preview
        ) {
            return null;
        }


        const card =
            start.closest(
                ".control-card"
            );


        const body =
            start.closest(
                ".card-body"
            );


        if (
            !card
            ||
            !body
        ) {
            return null;
        }


        const startOldRow =
            start.parentElement;


        const stopOldRow =
            stop.parentElement;


        const root =
            document.createElement(
                "div"
            );


        root.id =
            "fd15NavigationControls";


        root.className =
            "fd15-control-stack";


        const startStop =
            makeSwitch(
                "Start",
                "Stop",
                "start",
                "stop"
            );


        const pauseResume =
            makeSwitch(
                "Pause",
                "Resume",
                "pause",
                "play"
            );


        root.append(
            startStop.shell,
            pauseResume.shell
        );


        /*
         * Keep the REAL Preview button/event listener.
         * Merely move it below the two exact switches.
         */

        preview.textContent =
            "Preview";


        preview.classList.add(
            "fd15-preview",
            "fd15-reset-like"
        );


        root.appendChild(
            preview
        );


        if (startOldRow) {

            startOldRow.parentElement
                .insertBefore(
                    root,
                    startOldRow
                );
        }

        else {

            body.appendChild(
                root
            );
        }


        for (
            const original
            of [
                start,
                stop,
                pause,
                resume,
            ]
        ) {

            original.style.setProperty(
                "display",
                "none",
                "important"
            );
        }


        for (
            const row
            of new Set(
                [
                    startOldRow,
                    stopOldRow,
                ]
            )
        ) {

            if (
                row
                &&
                !row.contains(
                    preview
                )
            ) {

                row.classList.add(
                    "fd15-hide-native-row"
                );
            }
        }


        startStop.left.addEventListener(
            "click",
            () => {

                if (!start.disabled) {

                    start.click();
                }
            }
        );


        startStop.right.addEventListener(
            "click",
            () => {

                if (!stop.disabled) {

                    stop.click();
                }
            }
        );


        pauseResume.left.addEventListener(
            "click",
            () => {

                if (!pauseResume.left.disabled) {

                    pause.click();
                }
            }
        );


        pauseResume.right.addEventListener(
            "click",
            () => {

                if (!pauseResume.right.disabled) {

                    resume.click();
                }
            }
        );


        /*
         * Preview can change navigate.disabled without waiting
         * for a full telemetry state response.
         */

        preview.addEventListener(
            "click",
            () => {

                window.setTimeout(
                    () =>
                        syncNavigation(
                            lastState
                        ),
                    100
                );
            }
        );


        navigationUi = {
            start,
            stop,
            pause,
            resume,
            preview,
            startStop,
            pauseResume,
        };


        return navigationUi;
    }


    function syncNavigation(
        next
    ) {

        const ui =
            buildNavigation();


        if (!ui) {
            return;
        }


        const running =
            navigationRunning(
                next
            );


        const paused =
            navigationPaused(
                next
            );


        if (running) {

            setSwitchState(
                ui.startStop,
                "right",
                "right-amber"
            );

        }

        else {

            setSwitchState(
                ui.startStop,
                "left",
                "left-green"
            );
        }


        /*
         * Respect original functional disabled state.
         */

        ui.startStop.left.disabled =
            !!ui.start.disabled;


        ui.startStop.right.disabled =
            !!ui.stop.disabled;


        if (paused) {

            setSwitchState(
                ui.pauseResume,
                "right",
                "right-green"
            );

        }

        else {

            setSwitchState(
                ui.pauseResume,
                "left",
                "left-amber"
            );
        }


        ui.pauseResume.left.disabled =
            !!ui.pause.disabled
            ||
            paused;


        ui.pauseResume.right.disabled =
            !!ui.resume.disabled
            ||
            !paused;
    }


    /* ========================================================
       RESET VIEW STYLE — PREVIEW + KEYBOARD CONTROL
       ======================================================== */

    function applyStyles(
        target,
        sourceStyle
    ) {

        if (
            !target
            ||
            !sourceStyle
        ) {
            return;
        }


        const properties = [
            "height",
            "minHeight",

            "paddingTop",
            "paddingRight",
            "paddingBottom",
            "paddingLeft",

            "background",
            "backgroundColor",
            "backgroundImage",

            "borderTopWidth",
            "borderTopStyle",
            "borderTopColor",

            "borderRightWidth",
            "borderRightStyle",
            "borderRightColor",

            "borderBottomWidth",
            "borderBottomStyle",
            "borderBottomColor",

            "borderLeftWidth",
            "borderLeftStyle",
            "borderLeftColor",

            "borderRadius",

            "boxShadow",

            "color",

            "fontFamily",
            "fontSize",
            "fontWeight",
            "lineHeight",
            "letterSpacing",
        ];


        for (
            const property
            of properties
        ) {

            const cssName =
                property.replace(
                    /[A-Z]/g,
                    c =>
                        "-"
                        +
                        c.toLowerCase()
                );


            target.style.setProperty(
                cssName,
                sourceStyle[
                    property
                ],
                "important"
            );
        }
    }


    function liveResetStyle() {

        try {

            const doc =
                window.parent.document;


            if (
                !doc
                ||
                doc === document
            ) {
                return null;
            }


            const source =
                doc.getElementById(
                    "twinResetBtn"
                )
                ||
                [
                    ...doc.querySelectorAll(
                        "button"
                    )
                ]
                .find(
                    button =>
                        String(
                            button.textContent
                            ||
                            ""
                        )
                        .trim()
                        .toLowerCase()
                        ===
                        "reset view"
                );


            return source
                ?
                window.parent
                    .getComputedStyle(
                        source
                    )
                :
                null;

        }

        catch (_) {

            return null;
        }
    }


    function stylePreviewAndKeyboard() {

        const style =
            liveResetStyle();


        const preview =
            $("preview-route");


        if (preview) {

            applyStyles(
                preview,
                style
            );


            preview.style.setProperty(
                "width",
                "100%",
                "important"
            );
        }


        const leaves =
            [
                ...document.querySelectorAll(
                    "strong, span, div"
                )
            ];


        const label =
            leaves.find(
                element => {

                    if (
                        element.children.length
                        >
                        0
                    ) {
                        return false;
                    }


                    return String(
                        element.textContent
                        ||
                        ""
                    )
                    .trim()
                    .toLowerCase()
                    .replace(
                        /^[^\w]+/,
                        ""
                    )
                    ===
                    "keyboard control";
                }
            );


        if (!label) {
            return;
        }


        const target =
            label.closest(
                ".keyboard-control,"
                +
                ".keyboard-help,"
                +
                ".teleop-keyboard,"
                +
                ".help,"
                +
                ".notice"
            )
            ||
            label.parentElement;


        if (!target) {
            return;
        }


        target.classList.add(
            "fd15-reset-like"
        );


        applyStyles(
            target,
            style
        );


        target.style.setProperty(
            "width",
            "100%",
            "important"
        );


        target.style.setProperty(
            "box-sizing",
            "border-box",
            "important"
        );


        target.style.setProperty(
            "display",
            "flex",
            "important"
        );


        target.style.setProperty(
            "align-items",
            "center",
            "important"
        );


        target.style.setProperty(
            "justify-content",
            "flex-start",
            "important"
        );
    }


    /* ========================================================
       PIPELINE LABEL CAPITALIZATION
       ======================================================== */

    function capitalizePipeline() {

        const pipeline =
            document.querySelector(
                ".velocity-pipeline"
            );


        if (!pipeline) {
            return;
        }


        const replacements = {
            "controller":
                "Controller",

            "selector":
                "Selector",

            "smoother":
                "Smoother",

            "collision":
                "Collision",

            "ros→7105":
                "ROS→7105",

            "yaw goal/base":
                "Yaw goal/base",
        };


        for (
            const span
            of pipeline.querySelectorAll(
                "span"
            )
        ) {

            const key =
                String(
                    span.textContent
                    ||
                    ""
                )
                .trim()
                .toLowerCase();


            if (
                replacements[
                    key
                ]
            ) {

                span.textContent =
                    replacements[
                        key
                    ];
            }
        }
    }


    /* ========================================================
       ANGLE PRESETS
       ======================================================== */

    function styleAnglePresets() {

        const reference =
            $("goal-x")
            ||
            document.querySelector(
                'input[type="number"]'
            );


        const computed =
            reference
            ?
            getComputedStyle(
                reference
            )
            :
            null;


        for (
            const button
            of document.querySelectorAll(
                ".yaw-presets button"
            )
        ) {

            const yaw =
                String(
                    button.dataset.yaw
                    ||
                    ""
                );


            if (yaw === "0") {

                button.textContent =
                    "0°";

            }

            else if (yaw === "90") {

                button.textContent =
                    "90°";

            }

            else if (yaw === "180") {

                button.textContent =
                    "180°";

            }

            else if (
                yaw === "-90"
                ||
                yaw === "270"
            ) {

                button.textContent =
                    "270°";
            }


            button.classList.add(
                "fd15-angle"
            );


            if (computed) {

                button.style.setProperty(
                    "background-color",
                    computed.backgroundColor,
                    "important"
                );


                button.style.setProperty(
                    "border-color",
                    computed.borderColor,
                    "important"
                );


                button.style.setProperty(
                    "color",
                    computed.color,
                    "important"
                );
            }
        }
    }


    /* ========================================================
       RANGE COLOR
       ======================================================== */

    function syncRange(
        input
    ) {

        const min =
            Number(
                input.min
                ||
                0
            );


        const max =
            Number(
                input.max
                ||
                100
            );


        const value =
            Number(
                input.value
            );


        const pct =
            max > min
            ?
            Math.max(
                0,
                Math.min(
                    100,
                    (
                        (
                            value - min
                        )
                        /
                        (
                            max - min
                        )
                    )
                    *
                    100
                )
            )
            :
            0;


        input.style.setProperty(
            "--fd15-fill",
            `${pct}%`
        );
    }


    function setupRanges() {

        for (
            const input
            of document.querySelectorAll(
                'input[type="range"]'
            )
        ) {

            input.classList.remove(
                "fd14-range"
            );


            input.classList.add(
                "fd15-range"
            );


            syncRange(
                input
            );


            input.addEventListener(
                "input",
                () =>
                    syncRange(
                        input
                    )
            );


            input.addEventListener(
                "change",
                () =>
                    syncRange(
                        input
                    )
            );
        }
    }


    /* ========================================================
       BIGGER CENTER ANIMATION
       ======================================================== */

    function upgradeAnimation() {

        const art =
            $("fd13-slam-art");


        if (!art) {
            return;
        }


        art.innerHTML = `
<svg viewBox="0 0 800 470" aria-hidden="true">

  <!-- lower plane -->
  <g class="fd15-map-plane lower"
     transform="translate(0 55)">
    <path d="M400 58 L728 218 L400 378 L72 218 Z"/>
    <path d="M126 192 L454 352"/>
    <path d="M181 165 L509 325"/>
    <path d="M236 138 L564 298"/>
    <path d="M291 111 L619 271"/>
    <path d="M346 84 L674 244"/>

    <path d="M674 192 L346 352"/>
    <path d="M619 165 L291 325"/>
    <path d="M564 138 L236 298"/>
    <path d="M509 111 L181 271"/>
    <path d="M454 84 L126 244"/>
  </g>

  <!-- main plane -->
  <g class="fd15-map-plane">
    <path d="M400 58 L728 218 L400 378 L72 218 Z"/>

    <path d="M126 192 L454 352"/>
    <path d="M181 165 L509 325"/>
    <path d="M236 138 L564 298"/>
    <path d="M291 111 L619 271"/>
    <path d="M346 84 L674 244"/>

    <path d="M674 192 L346 352"/>
    <path d="M619 165 L291 325"/>
    <path d="M564 138 L236 298"/>
    <path d="M509 111 L181 271"/>
    <path d="M454 84 L126 244"/>
  </g>

  <!-- upper plane -->
  <g class="fd15-map-plane upper"
     transform="translate(0 -55)">
    <path d="M400 105 L626 215 L400 325 L174 215 Z"/>
    <path d="M249 188 L475 298"/>
    <path d="M324 151 L550 261"/>
    <path d="M550 188 L324 298"/>
    <path d="M475 151 L249 261"/>
  </g>

  <!-- structures -->
  <path class="fd15-wall-green"
        d="M156 245 L156 128 L211 101 L211 218
           M211 101 L252 121 L252 237"/>

  <path class="fd15-wall-amber"
        d="M279 297 L279 180 L332 154 L332 270
           M332 154 L378 176 L378 291"/>

  <path class="fd15-wall-green"
        d="M443 242 L443 122 L501 150 L501 270
           M501 150 L545 129 L545 248"/>

  <path class="fd15-wall-amber"
        d="M573 303 L573 221 L621 198 L621 280"/>

  <path class="fd15-wall-green"
        d="M360 167 L360 92 L400 72 L400 148
           M400 72 L442 93 L442 169"/>

  <path class="fd15-wall-green"
        d="M208 305 L208 249 L246 230 L246 286"/>

  <path class="fd15-wall-amber"
        d="M508 340 L508 279 L550 258 L550 319"/>

  <!-- scan plane -->
  <path class="fd15-scan"
        d="M117 220 L400 82 L683 220 L400 358 Z"/>

  <!-- route traces -->
  <path class="fd15-route-green"
        d="M89 278
           C146 207 208 183 268 202
           C322 218 348 269 408 264
           C472 258 510 198 573 176
           C626 157 671 172 709 208"/>

  <path class="fd15-route-amber"
        d="M102 184
           C164 130 225 122 284 141
           C343 160 375 202 437 206
           C502 210 551 175 630 132"/>

  <path class="fd15-route-green"
        d="M175 330
           C225 283 280 269 329 284
           C378 298 421 334 474 320
           C525 306 557 275 613 266"/>

  <!-- lidar -->
  <line class="fd15-beam"
        x1="179"
        y1="111"
        x2="639"
        y2="347"/>

  <!-- point cloud -->
  <circle class="fd15-point-green" cx="108" cy="271" r="4"/>
  <circle class="fd15-point-green" cx="148" cy="224" r="3.5"/>
  <circle class="fd15-point-amber" cx="191" cy="180" r="4.4"/>
  <circle class="fd15-point-green" cx="232" cy="223" r="3.8"/>
  <circle class="fd15-point-green" cx="276" cy="188" r="3.4"/>
  <circle class="fd15-point-amber" cx="326" cy="240" r="4.7"/>
  <circle class="fd15-point-green" cx="370" cy="206" r="3.8"/>
  <circle class="fd15-point-green" cx="418" cy="254" r="4.2"/>
  <circle class="fd15-point-amber" cx="458" cy="194" r="4.6"/>
  <circle class="fd15-point-green" cx="506" cy="225" r="4"/>
  <circle class="fd15-point-green" cx="553" cy="180" r="3.8"/>
  <circle class="fd15-point-amber" cx="603" cy="219" r="4.3"/>
  <circle class="fd15-point-green" cx="653" cy="163" r="3.7"/>
  <circle class="fd15-point-amber" cx="637" cy="290" r="3.8"/>
  <circle class="fd15-point-green" cx="571" cy="327" r="3.5"/>
  <circle class="fd15-point-green" cx="493" cy="349" r="3.6"/>
  <circle class="fd15-point-amber" cx="401" cy="323" r="4"/>
  <circle class="fd15-point-green" cx="312" cy="345" r="3.6"/>
  <circle class="fd15-point-green" cx="237" cy="317" r="3.8"/>
  <circle class="fd15-point-amber" cx="157" cy="304" r="3.8"/>

  <!-- active scan rings -->
  <circle class="fd15-ring"
          cx="326"
          cy="240"
          r="24"/>

  <circle class="fd15-ring amber"
          cx="458"
          cy="194"
          r="19"/>

  <circle class="fd15-ring"
          cx="571"
          cy="327"
          r="16"/>

</svg>
`;
    }


    /* ========================================================
       GLOBAL STATE SYNC
       ======================================================== */

    function syncAll(
        next
    ) {

        if (next) {

            lastState =
                next;
        }


        syncMapping();

        syncNavigation(
            lastState
        );
    }


    window.fullDashSyncV15 =
        syncAll;


    /* ========================================================
       BOOT
       ======================================================== */

    function boot() {

        buildMapping();

        buildNavigation();

        setupRanges();

        capitalizePipeline();

        styleAnglePresets();

        stylePreviewAndKeyboard();

        upgradeAnimation();

        syncAll(
            lastState
        );
    }


    if (
        document.readyState
        ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once:
                    true,
            }
        );

    }

    else {

        boot();
    }

})();


/* ============================================================
   FULL_DASH_EXACT_CONTROLS_V151
   finite correction pass — no observer, no interval
   ============================================================ */

(() => {
    "use strict";


    const $ =
        id =>
            document.getElementById(
                id
            );


    let latestState =
        null;


    /* --------------------------------------------------------
       NORMALIZE TEXT
       -------------------------------------------------------- */

    function words(
        node
    ) {

        return String(
            node?.textContent
            ||
            ""
        )
        .toLowerCase()
        .replace(
            /[^a-z0-9]+/g,
            " "
        )
        .trim();
    }


    /* --------------------------------------------------------
       REMOVE OLD MAPPING ROWS
       -------------------------------------------------------- */

    function cleanMappingCopies() {

        const start =
            $("start-map");


        if (!start) {
            return;
        }


        const card =
            start.closest(
                ".control-card"
            );


        if (!card) {
            return;
        }


        const keep =
            $("fd15MappingControls");


        const obvious = [
            "#fd13MappingControls",
            ".fd-map-primary-row-v5",
            ".fd-map-secondary-row-v5",
            ".mapping-actions",
        ];


        for (
            const selector
            of obvious
        ) {

            for (
                const node
                of card.querySelectorAll(
                    selector
                )
            ) {

                if (
                    keep
                    &&
                    (
                        node === keep
                        ||
                        keep.contains(
                            node
                        )
                    )
                ) {
                    continue;
                }


                node.classList.add(
                    "fd151-retired-control"
                );


                node.style.setProperty(
                    "display",
                    "none",
                    "important"
                );
            }
        }


        /*
         * Catch unnamed historical rows.
         *
         * Only small elements inside Mapping are considered;
         * this cannot swallow the whole Mapping card.
         */

        for (
            const node
            of card.querySelectorAll(
                "button, .button-row, div"
            )
        ) {

            if (
                keep
                &&
                (
                    node === keep
                    ||
                    keep.contains(
                        node
                    )
                )
            ) {
                continue;
            }


            const t =
                words(
                    node
                );


            const match =
                (
                    t.includes(
                        "start mapping"
                    )
                    &&
                    t.includes(
                        "stop"
                    )
                )
                ||
                t ===
                    "pause"
                ||
                t ===
                    "resume"
                ||
                t ===
                    "pause resume";


            if (!match) {
                continue;
            }


            /*
             * Never hide the entire card/body.
             */

            if (
                node === card
                ||
                node.classList.contains(
                    "card-body"
                )
            ) {
                continue;
            }


            const rect =
                node.getBoundingClientRect();


            if (
                rect.height
                >
                70
            ) {
                continue;
            }


            node.classList.add(
                "fd151-retired-control"
            );


            node.style.setProperty(
                "display",
                "none",
                "important"
            );
        }
    }


    /* --------------------------------------------------------
       EXACT INDICATOR GEOMETRY
       -------------------------------------------------------- */

    function placeIndicator(
        shell
    ) {

        if (!shell) {
            return;
        }


        const active =
            shell.dataset.side
            ===
            "right"
            ?
            shell.querySelector(
                ".fd15-right"
            )
            :
            shell.querySelector(
                ".fd15-left"
            );


        if (!active) {
            return;
        }


        const shellRect =
            shell.getBoundingClientRect();


        const activeRect =
            active.getBoundingClientRect();


        const x =
            activeRect.left
            -
            shellRect.left;


        shell.style.setProperty(
            "--fd151-indicator-x",
            `${x}px`
        );


        shell.style.setProperty(
            "--fd151-indicator-width",
            `${activeRect.width}px`
        );
    }


    function placeAllIndicators() {

        for (
            const shell
            of document.querySelectorAll(
                ".fd15-live-switch"
            )
        ) {

            placeIndicator(
                shell
            );
        }
    }


    /* --------------------------------------------------------
       FORCE MAPPING STATE
       -------------------------------------------------------- */

    function syncMapping(
        next
    ) {

        const root =
            $("fd15MappingControls");


        const start =
            $("start-map");


        const stop =
            $("stop-map");


        const pause =
            $("pause-map");


        if (
            !root
            ||
            !start
            ||
            !stop
            ||
            !pause
        ) {
            return;
        }


        const switches =
            root.querySelectorAll(
                ".fd15-live-switch"
            );


        const run =
            switches[0];


        const pauseResume =
            switches[1];


        const active =
            typeof next?.mapping_active
            ===
            "boolean"
            ?
            next.mapping_active
            :
            (
                start.disabled
                &&
                !stop.disabled
            );


        const paused =
            typeof next?.mapping_paused
            ===
            "boolean"
            ?
            next.mapping_paused
            :
            (
                pause.dataset
                    .slamPauseState
                ===
                "resume"
            );


        if (run) {

            run.dataset.side =
                active
                ?
                "right"
                :
                "left";


            run.dataset.mode =
                active
                ?
                "right-amber"
                :
                "left-green";


            placeIndicator(
                run
            );
        }


        if (pauseResume) {

            pauseResume.dataset.side =
                paused
                ?
                "right"
                :
                "left";


            pauseResume.dataset.mode =
                paused
                ?
                "right-green"
                :
                "left-amber";


            placeIndicator(
                pauseResume
            );
        }
    }


    /* --------------------------------------------------------
       NAVIGATION SWITCH GEOMETRY
       -------------------------------------------------------- */

    function syncNavigationIndicators() {

        const root =
            $("fd15NavigationControls");


        if (!root) {
            return;
        }


        for (
            const shell
            of root.querySelectorAll(
                ".fd15-live-switch"
            )
        ) {

            placeIndicator(
                shell
            );
        }
    }


    /* --------------------------------------------------------
       RANGE
       -------------------------------------------------------- */

    function syncRange(
        input
    ) {

        const min =
            Number(
                input.min
                ||
                0
            );


        const max =
            Number(
                input.max
                ||
                100
            );


        const value =
            Number(
                input.value
            );


        const pct =
            max > min
            ?
            Math.max(
                0,
                Math.min(
                    100,
                    (
                        (
                            value - min
                        )
                        /
                        (
                            max - min
                        )
                    )
                    *
                    100
                )
            )
            :
            0;


        input.style.setProperty(
            "--fd151-fill",
            `${pct}%`
        );
    }


    function styleRanges() {

        for (
            const input
            of document.querySelectorAll(
                'input[type="range"]'
            )
        ) {

            input.classList.add(
                "fd15-range"
            );


            syncRange(
                input
            );


            if (
                input.dataset
                    .fd151Range
            ) {
                continue;
            }


            input.dataset
                .fd151Range =
                "1";


            input.addEventListener(
                "input",
                () =>
                    syncRange(
                        input
                    )
            );


            input.addEventListener(
                "change",
                () =>
                    syncRange(
                        input
                    )
            );
        }
    }


    /* --------------------------------------------------------
       PREVIEW + KEYBOARD CONTROL
       -------------------------------------------------------- */

    function styleResetActions() {

        const preview =
            $("preview-route");


        if (preview) {

            preview.classList.add(
                "fd151-reset-action"
            );


            preview.textContent =
                "Preview";
        }


        const leaves =
            [
                ...document.querySelectorAll(
                    "*"
                )
            ];


        const keyboardTitle =
            leaves.find(
                node => {

                    if (
                        node.children.length
                        !==
                        0
                    ) {
                        return false;
                    }


                    return String(
                        node.textContent
                        ||
                        ""
                    )
                    .trim()
                    .toLowerCase()
                    .replace(
                        /^[^\w]+/,
                        ""
                    )
                    ===
                    "keyboard control";
                }
            );


        if (!keyboardTitle) {
            return;
        }


        const box =
            keyboardTitle.closest(
                ".help,"
                +
                ".notice,"
                +
                ".keyboard-control,"
                +
                ".keyboard-help,"
                +
                ".teleop-keyboard"
            )
            ||
            keyboardTitle.parentElement;


        if (!box) {
            return;
        }


        box.classList.add(
            "fd151-reset-action"
        );


        box.style.setProperty(
            "justify-content",
            "flex-start",
            "important"
        );


        /*
         * Remove only this helper sentence.
         */

        for (
            const node
            of box.querySelectorAll(
                "*"
            )
        ) {

            if (
                node.children.length
                !==
                0
            ) {
                continue;
            }


            const text =
                String(
                    node.textContent
                    ||
                    ""
                )
                .trim()
                .toLowerCase();


            if (
                text ===
                "enable teleop for control"
            ) {

                node.remove();
            }
        }
    }


    /* --------------------------------------------------------
       LIVE-STATUS TYPOGRAPHY
       -------------------------------------------------------- */

    function styleLabels() {

        const wanted = new Set([
            "final map name",
            "session",
            "latest capture",
            "captures every 5 s",
            "captures every 5s",
            "partial-map sessions",
            "initial pose",
            "x (m)",
            "y (m)",
            "yaw (°)",
            "yaw (º)",
            "final orientation",
            "speed",
            "linear speed",
            "angular speed",
        ]);


        for (
            const node
            of document.querySelectorAll(
                "label, span, p, div"
            )
        ) {

            if (
                node.children.length
                >
                1
            ) {
                continue;
            }


            const text =
                String(
                    node.textContent
                    ||
                    ""
                )
                .trim()
                .toLowerCase();


            if (
                wanted.has(
                    text
                )
            ) {

                node.classList.add(
                    "fd151-status-label"
                );
            }
        }


        /*
         * Mapping status values:
         * Session / Latest capture / Captures every 5 s.
         */

        for (
            const row
            of document.querySelectorAll(
                ".kv-row, .metric-row"
            )
        ) {

            const children =
                [
                    ...row.children
                ];


            if (
                children.length
                <
                2
            ) {
                continue;
            }


            children[0]
                .classList
                .add(
                    "fd151-status-label"
                );


            children[
                children.length - 1
            ]
                .classList
                .add(
                    "fd151-status-value"
                );
        }
    }


    /* --------------------------------------------------------
       LARGE DETAILED SLAM ART
       -------------------------------------------------------- */



    /* --------------------------------------------------------
       LIVE DRAG GRIPS
       -------------------------------------------------------- */

    function styleDragHandles() {

        const selectors = [
            '[class*="drag-handle"]',
            '[class*="major-handle"]',
            '[class*="pane-handle"]',
            'button[title*="Drag"]',
            'button[aria-label*="Move"]',
        ];


        const candidates =
            [
                ...document.querySelectorAll(
                    selectors.join(",")
                )
            ];


        for (
            const handle
            of candidates
        ) {

            const rect =
                handle.getBoundingClientRect();


            /*
             * Horizontal reorder grips only.
             */

            if (
                rect.height
                >
                45
                ||
                rect.width
                >
                180
            ) {
                continue;
            }


            handle.classList.add(
                "fd151-live-handle"
            );


            let grip =
                handle.querySelector(
                    ":scope > span"
                );


            if (!grip) {

                grip =
                    document.createElement(
                        "span"
                    );


                handle.appendChild(
                    grip
                );
            }


            grip.classList.add(
                "fd151-live-grip"
            );
        }
    }


    /* --------------------------------------------------------
       WRAP CURRENT V15 STATE OWNER
       -------------------------------------------------------- */

    const priorSync =
        window.fullDashSyncV15;


    window.fullDashSyncV15 =
        next => {

            latestState =
                next
                ||
                latestState;


            if (
                typeof priorSync
                ===
                "function"
            ) {

                priorSync(
                    next
                );
            }


            syncMapping(
                latestState
            );


            syncNavigationIndicators();


            placeAllIndicators();


            cleanMappingCopies();
        };


    /* --------------------------------------------------------
       BOOT
       -------------------------------------------------------- */

    function boot() {

        styleRanges();

        styleResetActions();

        styleLabels();


        styleDragHandles();

        syncMapping(
            latestState
        );

        syncNavigationIndicators();

        placeAllIndicators();

        cleanMappingCopies();
    }


    if (
        document.readyState
        ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once:
                    true,
            }
        );

    }

    else {

        boot();
    }


    /*
     * FINITE cleanup only.
     *
     * Historical UI scripts perform a few delayed startup passes.
     * Catch them without introducing a MutationObserver or interval.
     */

    for (
        const delay
        of [
            80,
            250,
            600,
            1100,
            1800,
        ]
    ) {

        window.setTimeout(
            () => {

                boot();
            },
            delay
        );
    }


    window.addEventListener(
        "resize",
        () => {

            placeAllIndicators();
        }
    );

})();

/* ==================================================================
   FULL_DASH_EXACT_CONTROLS_V152
   DOM cleanup + exact Live-style major-panel interaction.
   ================================================================== */

(() => {
    "use strict";

    const $ =
        id =>
            document.getElementById(id);

    const norm =
        value =>
            String(value || "")
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();

    function mappingCard() {
        return $("start-map")
            ?.closest(".control-card")
            || null;
    }

    function retireOldMappingPresentation() {
        const card =
            mappingCard();

        const keep =
            $("fd15MappingControls");

        if (!card || !keep) {
            return;
        }

        for (
            const node
            of card.querySelectorAll(
                "#fd13MappingControls,"
                + ".fd-map-primary-row-v5,"
                + ".fd-map-secondary-row-v5,"
                + ".mapping-actions"
            )
        ) {
            if (
                node !== keep
                &&
                !keep.contains(node)
            ) {
                node.classList.add(
                    "fd152-retired-control"
                );
            }
        }

        const actionTexts =
            new Set([
                "start mapping",
                "start",
                "stop",
                "pause",
                "resume",
            ]);

        for (
            const button
            of card.querySelectorAll("button")
        ) {
            if (
                keep.contains(button)
                ||
                [
                    "start-map",
                    "stop-map",
                    "pause-map",
                ].includes(button.id)
            ) {
                continue;
            }

            const text =
                norm(
                    button.textContent
                        .replace(/[◇×Ⅱ▶◉■]/g, "")
                );

            if (!actionTexts.has(text)) {
                continue;
            }

            button.dataset.fd152Retired =
                "1";

            const parent =
                button.parentElement;

            if (
                parent
                &&
                [...parent.children]
                    .every(
                        child =>
                            child.tagName
                                === "BUTTON"
                            ||
                            child.dataset
                                ?.fd152Retired
                                === "1"
                    )
            ) {
                parent.dataset.fd152Retired =
                    "1";
            }
        }
    }

    function fixMappingLabels() {
        const root =
            $("fd15MappingControls");

        if (root) {
            const switches =
                root.querySelectorAll(
                    ".fd15-live-switch"
                );

            if (switches[0]) {
                const left =
                    switches[0]
                        .querySelector(
                            ".fd15-left"
                        );

                const right =
                    switches[0]
                        .querySelector(
                            ".fd15-right"
                        );

                if (left) {
                    left.textContent =
                        "◇ Start";
                }

                if (right) {
                    right.textContent =
                        "× Stop";
                }
            }

            if (switches[1]) {
                const left =
                    switches[1]
                        .querySelector(
                            ".fd15-left"
                        );

                const right =
                    switches[1]
                        .querySelector(
                            ".fd15-right"
                        );

                if (left) {
                    left.textContent =
                        "Ⅱ Pause";
                }

                if (right) {
                    right.textContent =
                        "▶ Resume";
                }
            }
        }

        const original =
            $("start-map");

        if (original) {
            original.innerHTML =
                "<span>◇</span> Start";
        }
    }

    function fixText() {
        for (
            const node
            of document.querySelectorAll(
                ".field-label"
            )
        ) {
            if (
                norm(node.textContent)
                === "final map name"
            ) {
                node.textContent =
                    "Map name";
            }
        }

        for (
            const node
            of document.querySelectorAll(
                "p.help"
            )
        ) {
            if (
                norm(node.textContent)
                    .includes(
                        "g1 navigation keeps"
                    )
            ) {
                node.remove();
            }
        }

        const keyState =
            $("teleop-key-state");

        if (keyState) {
            keyState.style.display =
                "none";
        }
    }

    function styleLabels() {
        const wanted =
            new Set([
                "map name",
                "session",
                "latest capture",
                "captures every 5 s",
                "partial-map sessions",
                "initial pose",
                "final orientation",
                "speed",
                "linear speed",
                "angular speed",
                "x (m)",
                "y (m)",
                "yaw (°)",
            ]);

        for (
            const node
            of document.querySelectorAll(
                ".field-label,"
                + ".range-label > span,"
                + ".mapping-stats span,"
                + ".metric-row > :first-child,"
                + ".kv-row > :first-child,"
                + "label"
            )
        ) {
            if (
                wanted.has(
                    norm(node.textContent)
                )
            ) {
                node.classList.add(
                    "fd152-xr-label"
                );
            }
        }

        for (
            const id
            of [
                "session-name",
                "last-snapshot",
                "snapshots",
                "speed-value",
                "teleop-speed-value",
                "teleop-turn-speed-value",
            ]
        ) {
            $(id)?.classList.add(
                "fd152-xr-value"
            );
        }
    }

    function styleAngles() {
        const yawButtons =
            [
                ...document.querySelectorAll(
                    "button[data-yaw]"
                ),
            ];

        if (!yawButtons.length) {
            return;
        }

        const card =
            yawButtons[0]
                .closest(".control-card");

        const sample =
            card?.querySelector(
                'input:not([type="range"])'
            );

        let cs =
            null;

        if (sample) {
            cs =
                getComputedStyle(sample);
        }

        for (
            const button
            of yawButtons
        ) {
            button.classList.add(
                "fd152-angle-tile"
            );

            const yaw =
                Number(
                    button.dataset.yaw
                );

            if (yaw === -90) {
                button.textContent =
                    "270°";
            }

            else {
                button.textContent =
                    `${yaw}°`;
            }

            if (cs) {
                button.style.setProperty(
                    "background",
                    cs.backgroundColor,
                    "important"
                );

                button.style.setProperty(
                    "border",
                    cs.border,
                    "important"
                );

                button.style.setProperty(
                    "border-radius",
                    cs.borderRadius,
                    "important"
                );
            }
        }
    }

    function styleActions() {
        const preview =
            $("preview-route");

        if (preview) {
            preview.classList.add(
                "fd151-reset-action"
            );
        }

        const strong =
            [
                ...document.querySelectorAll(
                    "strong"
                ),
            ].find(
                node =>
                    norm(node.textContent)
                    ===
                    "⌨ keyboard control"
                    ||
                    norm(node.textContent)
                    ===
                    "keyboard control"
            );

        const keyboard =
            strong?.parentElement;

        if (keyboard) {
            keyboard.classList.add(
                "fd152-keyboard-action"
            );
        }
    }

    function syncRanges() {
        for (
            const input
            of document.querySelectorAll(
                'input[type="range"]'
            )
        ) {
            input.classList.add(
                "fd15-range"
            );

            const min =
                Number(input.min || 0);

            const max =
                Number(input.max || 100);

            const value =
                Number(input.value || min);

            const pct =
                max > min
                ?
                Math.max(
                    0,
                    Math.min(
                        100,
                        (
                            (value - min)
                            /
                            (max - min)
                        )
                        * 100
                    )
                )
                :
                0;

            input.style.setProperty(
                "--fd151-fill",
                `${pct}%`
            );

            if (
                input.dataset
                    .fd152Range
            ) {
                continue;
            }

            input.dataset.fd152Range =
                "1";

            input.addEventListener(
                "input",
                () =>
                    syncRanges()
            );
        }
    }


    /*
     * Live V1.9.24 major-panel model:
     * - real panel follows cursor
     * - target is the three horizontal thirds
     * - DOM reflows while crossing slots
     * - stationary panels FLIP
     * - held point stays beneath cursor
     */
    function installLiveDragParity() {
        const raw =
            [
                ...document.querySelectorAll(
                    ".fd151-live-handle"
                ),
            ];

        const pairs =
            [];

        const seen =
            new Set();

        for (
            const handle
            of raw
        ) {
            const panel =
                handle.parentElement;

            if (
                !panel
                ||
                seen.has(panel)
            ) {
                continue;
            }

            const r =
                panel.getBoundingClientRect();

            if (
                r.width < 180
                ||
                r.height < 250
            ) {
                continue;
            }

            seen.add(panel);

            pairs.push({
                handle,
                panel,
            });
        }

        if (pairs.length !== 3) {
            return;
        }

        pairs.sort(
            (a, b) =>
                a.panel
                    .getBoundingClientRect()
                    .left
                -
                b.panel
                    .getBoundingClientRect()
                    .left
        );

        const grid =
            pairs[0]
                .panel
                .parentElement;

        if (
            !grid
            ||
            !pairs.every(
                item =>
                    item.panel
                        .parentElement
                    === grid
            )
        ) {
            return;
        }

        const keyFor =
            (panel, index) => {
                const text =
                    norm(
                        panel.textContent
                    );

                if (
                    text.includes(
                        "robot navigation"
                    )
                ) {
                    return "robot";
                }

                if (
                    text.includes(
                        "car navigation"
                    )
                ) {
                    return "car";
                }

                return index === 1
                    ? "center"
                    : `panel-${index}`;
            };

        const records =
            pairs.map(
                (item, index) => ({
                    key:
                        keyFor(
                            item.panel,
                            index
                        ),

                    panel:
                        item.panel,

                    handle:
                        item.handle,
                })
            );

        const byKey =
            new Map(
                records.map(
                    item => [
                        item.key,
                        item,
                    ]
                )
            );

        let order =
            records.map(
                item =>
                    item.key
            );

        const STORE =
            "full_dashboard_slam_major_order_v152";

        try {
            const saved =
                JSON.parse(
                    localStorage
                        .getItem(STORE)
                    ||
                    "null"
                );

            if (
                Array.isArray(saved)
                &&
                saved.length === 3
                &&
                saved.every(
                    key =>
                        byKey.has(key)
                )
            ) {
                order =
                    [...saved];
            }
        }

        catch (_) {
        }

        function applyOrder(
            next
        ) {
            for (
                const key
                of next
            ) {
                grid.appendChild(
                    byKey.get(key)
                        .panel
                );
            }
        }

        applyOrder(order);

        let drag =
            null;

        function captureRects(
            skip = null
        ) {
            const map =
                new Map();

            for (
                const record
                of records
            ) {
                if (
                    record.panel
                    === skip
                ) {
                    continue;
                }

                map.set(
                    record.panel,
                    record.panel
                        .getBoundingClientRect()
                );
            }

            return map;
        }

        function animateFrom(
            before,
            skip = null
        ) {
            for (
                const [
                    panel,
                    oldRect,
                ]
                of before
            ) {
                if (
                    panel === skip
                ) {
                    continue;
                }

                const nextRect =
                    panel
                        .getBoundingClientRect();

                const dx =
                    oldRect.left
                    -
                    nextRect.left;

                if (
                    Math.abs(dx)
                    < .5
                ) {
                    continue;
                }

                panel.animate(
                    [
                        {
                            transform:
                                `translate3d(${dx}px,0,0)`,
                        },
                        {
                            transform:
                                "translate3d(0,0,0)",
                        },
                    ],
                    {
                        duration:
                            260,

                        easing:
                            "cubic-bezier(.2,.85,.25,1)",
                    }
                );
            }
        }

        function targetIndex(
            clientX
        ) {
            const rect =
                grid
                    .getBoundingClientRect();

            const ratio =
                Math.max(
                    0,
                    Math.min(
                        .999999,
                        (
                            clientX
                            -
                            rect.left
                        )
                        /
                        Math.max(
                            1,
                            rect.width
                        )
                    )
                );

            if (ratio < 1 / 3) {
                return 0;
            }

            if (ratio < 2 / 3) {
                return 1;
            }

            return 2;
        }

        function candidateOrder(
            key,
            index,
            startOrder
        ) {
            const result =
                startOrder.filter(
                    item =>
                        item !== key
                );

            result.splice(
                index,
                0,
                key
            );

            return result;
        }

        function sameOrder(
            a,
            b
        ) {
            return (
                a.length === b.length
                &&
                a.every(
                    (value, index) =>
                        value === b[index]
                )
            );
        }

        function move(event) {
            if (
                !drag
                ||
                event.pointerId
                    !== drag.pointerId
            ) {
                return;
            }

            event.preventDefault();

            const desiredLeft =
                event.clientX
                -
                drag.grabOffset;

            drag.dx =
                desiredLeft
                -
                drag.baseLeft;

            drag.panel
                .style
                .setProperty(
                    "--fd152-drag-x",
                    `${drag.dx}px`
                );

            const candidate =
                candidateOrder(
                    drag.key,
                    targetIndex(
                        event.clientX
                    ),
                    drag.startOrder
                );

            if (
                sameOrder(
                    candidate,
                    drag.currentOrder
                )
            ) {
                return;
            }

            const before =
                captureRects(
                    drag.panel
                );

            const oldDx =
                drag.dx;

            applyOrder(
                candidate
            );

            const visualLeft =
                drag.panel
                    .getBoundingClientRect()
                    .left;

            drag.baseLeft =
                visualLeft
                -
                oldDx;

            drag.dx =
                desiredLeft
                -
                drag.baseLeft;

            drag.panel
                .style
                .setProperty(
                    "--fd152-drag-x",
                    `${drag.dx}px`
                );

            animateFrom(
                before,
                drag.panel
            );

            drag.currentOrder =
                [...candidate];

            drag.targetOrder =
                [...candidate];
        }

        function finish(
            event,
            cancelled
        ) {
            if (
                !drag
                ||
                event.pointerId
                    !== drag.pointerId
            ) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            const before =
                captureRects();

            const finalOrder =
                cancelled
                ?
                drag.startOrder
                :
                drag.targetOrder;

            try {
                drag.handle
                    .releasePointerCapture(
                        event.pointerId
                    );
            }

            catch (_) {
            }

            drag.panel.classList.remove(
                "fd152-major-following"
            );

            drag.handle.classList.remove(
                "fd152-handle-active"
            );

            drag.panel
                .style
                .removeProperty(
                    "--fd152-drag-x"
                );

            applyOrder(
                finalOrder
            );

            animateFrom(
                before
            );

            if (!cancelled) {
                order =
                    [...finalOrder];

                try {
                    localStorage.setItem(
                        STORE,
                        JSON.stringify(order)
                    );
                }

                catch (_) {
                }
            }

            document.removeEventListener(
                "pointermove",
                move,
                true
            );

            document.removeEventListener(
                "pointerup",
                finishUp,
                true
            );

            document.removeEventListener(
                "pointercancel",
                finishCancel,
                true
            );

            drag =
                null;
        }

        function finishUp(
            event
        ) {
            finish(
                event,
                false
            );
        }

        function finishCancel(
            event
        ) {
            finish(
                event,
                true
            );
        }

        for (
            const record
            of records
        ) {
            const old =
                record.handle;

            const handle =
                old.cloneNode(true);

            old.replaceWith(
                handle
            );

            record.handle =
                handle;

            handle.classList.add(
                "fd152-live-handle"
            );

            let grip =
                handle.querySelector(
                    ":scope > span"
                );

            if (!grip) {
                grip =
                    document.createElement(
                        "span"
                    );

                handle.appendChild(
                    grip
                );
            }

            grip.classList.add(
                "fd152-live-grip"
            );

            handle.addEventListener(
                "pointerdown",
                event => {
                    if (
                        event.button !== 0
                        ||
                        drag
                    ) {
                        return;
                    }

                    event.preventDefault();
                    event.stopImmediatePropagation();

                    const rect =
                        record.panel
                            .getBoundingClientRect();

                    drag = {
                        pointerId:
                            event.pointerId,

                        key:
                            record.key,

                        panel:
                            record.panel,

                        handle,

                        grabOffset:
                            event.clientX
                            -
                            rect.left,

                        baseLeft:
                            rect.left,

                        dx:
                            0,

                        startOrder:
                            [...order],

                        currentOrder:
                            [...order],

                        targetOrder:
                            [...order],
                    };

                    record.panel
                        .classList
                        .add(
                            "fd152-major-following"
                        );

                    handle
                        .classList
                        .add(
                            "fd152-handle-active"
                        );

                    try {
                        handle.setPointerCapture(
                            event.pointerId
                        );
                    }

                    catch (_) {
                    }

                    document.addEventListener(
                        "pointermove",
                        move,
                        true
                    );

                    document.addEventListener(
                        "pointerup",
                        finishUp,
                        true
                    );

                    document.addEventListener(
                        "pointercancel",
                        finishCancel,
                        true
                    );
                },
                true
            );
        }
    }

    function boot() {
        retireOldMappingPresentation();
        fixMappingLabels();
        fixText();
        styleLabels();
        styleAngles();
        styleActions();
        syncRanges();

        requestAnimationFrame(
            () => {
                retireOldMappingPresentation();
                installLiveDragParity();
            }
        );

        setTimeout(
            () => {
                retireOldMappingPresentation();
                fixMappingLabels();
                syncRanges();
            },
            200
        );
    }

    if (
        document.readyState
        ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once:
                    true,
            }
        );
    }

    else {
        boot();
    }
})();

/* ===== END full_dashboard_exact_controls_v15.js ===== */

/* ===== BEGIN full_dashboard_parity_v16.js ===== */

/* FULL_DASH_SLAM_PARITY_JS_V16 */

(() => {
    "use strict";

    const $ =
        id =>
            document.getElementById(id);

    const clean =
        value =>
            String(value || "")
            .replace(/\s+/g, " ")
            .trim();

    const lower =
        value =>
            clean(value).toLowerCase();


    /* ========================================================
       1. EXACT SEGMENT INDICATOR GEOMETRY
       ======================================================== */

    function syncIndicator(shell) {
        if (!shell) {
            return;
        }

        const active =
            shell.dataset.side === "right"
            ?
            shell.querySelector(".fd15-right")
            :
            shell.querySelector(".fd15-left");

        const indicator =
            shell.querySelector(
                ".fd15-live-indicator"
            );

        if (!active || !indicator) {
            return;
        }

        const sr =
            shell.getBoundingClientRect();

        const ar =
            active.getBoundingClientRect();

        const x =
            ar.left - sr.left;

        indicator.style.setProperty(
            "width",
            `${ar.width}px`,
            "important"
        );

        indicator.style.setProperty(
            "transform",
            `translate3d(${x}px,3px,0)`,
            "important"
        );
    }


    function syncIndicators() {
        document
            .querySelectorAll(
                ".fd15-live-switch"
            )
            .forEach(syncIndicator);
    }


    function renameMappingStart() {
        const root =
            $("fd15MappingControls");

        const left =
            root?.querySelector(
                ".fd15-live-switch:first-child .fd15-left"
            );

        if (left) {
            const icon =
                left.querySelector(
                    ".fd15-icon"
                );

            left.replaceChildren();

            if (icon) {
                left.appendChild(icon);
            }

            const span =
                document.createElement("span");

            span.textContent =
                "Start";

            left.appendChild(span);
        }
    }


    /* ========================================================
       2. TOP / BOTTOM CENTER STRIPS
       ======================================================== */

    function cleanCenterTop() {
        const top =
            document.querySelector(
                ".workspace > .topbar"
            );

        if (!top) {
            return;
        }

        for (
            const node
            of top.querySelectorAll(
                "button, span, div"
            )
        ) {
            const t =
                lower(
                    node.textContent
                );

            if (
                t === "cyclonedds"
                ||
                t === "slam map → xy"
                ||
                t === "slam map -> xy"
            ) {
                node.classList.add(
                    "fd16-hidden"
                );
            }
        }

        document
            .querySelectorAll(
                ".viewer-hint"
            )
            .forEach(
                node =>
                    node.classList.add(
                        "fd16-hidden"
                    )
            );
    }


    function removeCarHelp() {
        const phrases = [
            "click and drag for position and direction",
            "runs directly on the geometry of both maps",
        ];

        document
            .querySelectorAll(
                ".car-side p, .car-side .help"
            )
            .forEach(
                node => {
                    const t =
                        lower(
                            node.textContent
                        );

                    if (
                        phrases.some(
                            phrase =>
                                t.includes(phrase)
                        )
                    ) {
                        node.classList.add(
                            "fd16-hidden"
                        );
                    }
                }
            );
    }


    /* ========================================================
       3. RESET VIEW ACTION PARITY
       ======================================================== */

    function copyComputed(
        target,
        source,
        properties
    ) {
        if (!target || !source) {
            return;
        }

        const cs =
            source.ownerDocument
                .defaultView
                .getComputedStyle(
                    source
                );

        for (
            const prop
            of properties
        ) {
            target.style.setProperty(
                prop,
                cs.getPropertyValue(prop),
                "important"
            );
        }
    }


    function liveResetButton() {
        try {
            const doc =
                window.parent.document;

            if (
                !doc
                ||
                doc === document
            ) {
                return null;
            }

            return (
                doc.getElementById(
                    "twinResetBtn"
                )
                ||
                [...doc.querySelectorAll("button")]
                .find(
                    button =>
                        lower(
                            button.textContent
                        ) ===
                        "reset view"
                )
                ||
                null
            );
        }

        catch (_) {
            return null;
        }
    }


    function styleActions() {
        const preview =
            $("preview-route");

        let keyboard =
            null;

        for (
            const node
            of document.querySelectorAll(
                "strong, span, div"
            )
        ) {
            if (
                node.children.length === 0
                &&
                lower(
                    node.textContent
                    .replace(/^[^\w]+/, "")
                )
                ===
                "keyboard control"
            ) {
                keyboard =
                    node.closest(
                        ".teleop-capture,"
                        +
                        ".keyboard-control,"
                        +
                        ".keyboard-help"
                    )
                    ||
                    node.parentElement;

                break;
            }
        }

        if (keyboard) {
            keyboard.classList.add(
                "fd16-keyboard-action"
            );

            keyboard.style.setProperty(
                "justify-content",
                "center",
                "important"
            );
        }

        if (preview) {
            preview.classList.add(
                "fd151-reset-action"
            );
        }

        const source =
            liveResetButton();

        const properties = [
            "height",
            "min-height",
            "max-height",
            "padding-top",
            "padding-right",
            "padding-bottom",
            "padding-left",
            "background",
            "background-color",
            "background-image",
            "border-top-width",
            "border-top-style",
            "border-top-color",
            "border-right-width",
            "border-right-style",
            "border-right-color",
            "border-bottom-width",
            "border-bottom-style",
            "border-bottom-color",
            "border-left-width",
            "border-left-style",
            "border-left-color",
            "border-radius",
            "box-shadow",
            "color",
            "font-family",
            "font-size",
            "font-weight",
            "line-height",
            "letter-spacing",
        ];

        if (source) {
            copyComputed(
                preview,
                source,
                properties
            );

            copyComputed(
                keyboard,
                source,
                properties
            );
        }

        for (
            const target
            of [preview, keyboard]
        ) {
            if (!target) {
                continue;
            }

            target.style.setProperty(
                "display",
                "flex",
                "important"
            );

            target.style.setProperty(
                "align-items",
                "center",
                "important"
            );

            target.style.setProperty(
                "justify-content",
                "center",
                "important"
            );

            target.style.setProperty(
                "text-align",
                "center",
                "important"
            );
        }

        const keyState =
            $("teleop-key-state");

        if (keyState) {
            keyState.style.setProperty(
                "display",
                "none",
                "important"
            );
        }
    }


    /* ========================================================
       4. XR TYPOGRAPHY / TEXT NORMALIZATION
       ======================================================== */

    function normalizeText() {
        for (
            const node
            of document.querySelectorAll(
                ".field-label"
            )
        ) {
            if (
                lower(node.textContent)
                ===
                "final map name"
            ) {
                node.textContent =
                    "Map name";
            }
        }

        const labels = new Set([
            "map name",
            "session",
            "latest capture",
            "captures every 5 s",
            "captures every 5s",
            "partial-map sessions",
            "initial pose",
            "final orientation",
            "speed",
            "linear speed",
            "angular speed",
            "x (m)",
            "y (m)",
            "yaw (°)",
        ]);

        document
            .querySelectorAll(
                ".field-label,"
                +
                ".range-label > span,"
                +
                ".mapping-stats span,"
                +
                ".kv-row > :first-child,"
                +
                ".metric-row > :first-child,"
                +
                "label"
            )
            .forEach(
                node => {
                    if (
                        labels.has(
                            lower(
                                node.textContent
                            )
                        )
                    ) {
                        node.classList.add(
                            "fd16-xr-label"
                        );
                    }
                }
            );


        for (
            const id
            of [
                "session-name",
                "last-snapshot",
                "snapshots",
                "speed-value",
                "teleop-speed-value",
                "teleop-turn-speed-value",
            ]
        ) {
            $(id)?.classList.add(
                "fd16-xr-value"
            );
        }
    }


    /* ========================================================
       5. RANGE
       ======================================================== */

    function syncRange(input) {
        const min =
            Number(
                input.min || 0
            );

        const max =
            Number(
                input.max || 100
            );

        const value =
            Number(
                input.value || min
            );

        const pct =
            max > min
            ?
            Math.max(
                0,
                Math.min(
                    100,
                    (
                        (
                            value - min
                        )
                        /
                        (
                            max - min
                        )
                    )
                    *
                    100
                )
            )
            :
            0;

        input.style.setProperty(
            "--fd16-range-pct",
            `${pct}%`
        );
    }


    function setupRanges() {
        document
            .querySelectorAll(
                'input[type="range"]'
            )
            .forEach(
                input => {
                    input.classList.add(
                        "fd15-range"
                    );

                    syncRange(
                        input
                    );

                    if (
                        input.dataset.fd16Range
                    ) {
                        return;
                    }

                    input.dataset.fd16Range =
                        "1";

                    input.addEventListener(
                        "input",
                        () =>
                            syncRange(
                                input
                            )
                    );
                }
            );
    }


    /* ========================================================
       6. ANGLE TILES
       ======================================================== */

    function styleAngles() {
        const buttons =
            [
                ...document.querySelectorAll(
                    "button[data-yaw]"
                )
            ];

        if (!buttons.length) {
            return;
        }

        const input =
            buttons[0]
            .closest(
                ".control-card"
            )
            ?.querySelector(
                'input[type="number"]'
            );

        const cs =
            input
            ?
            getComputedStyle(
                input
            )
            :
            null;

        for (
            const button
            of buttons
        ) {
            button.classList.add(
                "fd16-angle"
            );

            const yaw =
                Number(
                    button.dataset.yaw
                );

            button.textContent =
                yaw === -90
                ?
                "270°"
                :
                `${yaw}°`;

            if (cs) {
                button.style.setProperty(
                    "background",
                    cs.backgroundColor,
                    "important"
                );

                button.style.setProperty(
                    "border",
                    cs.border,
                    "important"
                );

                button.style.setProperty(
                    "border-radius",
                    cs.borderRadius,
                    "important"
                );
            }
        }
    }


    /* ========================================================
       7. LARGE SLAM ART
       ======================================================== */



    /* ========================================================
       8. LIVE-STYLE MAJOR SECTION DRAG
       ======================================================== */

    let dragState =
        null;

    let majorShell =
        null;

    const major =
        new Map();


    function findMajor() {
        majorShell =
            document.querySelector(
                ".app-shell"
            );

        if (!majorShell) {
            return false;
        }

        const robot =
            majorShell.querySelector(
                ":scope > .control-panel:not(.car-side)"
            );

        const center =
            majorShell.querySelector(
                ":scope > .workspace"
            );

        const car =
            majorShell.querySelector(
                ":scope > .control-panel.car-side"
            );

        if (
            !robot
            ||
            !center
            ||
            !car
        ) {
            return false;
        }

        major.clear();

        major.set(
            "robot",
            robot
        );

        major.set(
            "center",
            center
        );

        major.set(
            "car",
            car
        );

        for (
            const [key, node]
            of major
        ) {
            node.dataset.fd16Major =
                key;
        }

        return true;
    }


    function currentOrder() {
        if (!majorShell) {
            return [];
        }

        return [
            ...majorShell.children
        ]
        .filter(
            node =>
                node.dataset.fd16Major
        )
        .map(
            node =>
                node.dataset.fd16Major
        );
    }


    function applyOrder(order) {
        for (
            const key
            of order
        ) {
            const node =
                major.get(key);

            if (node) {
                majorShell.appendChild(
                    node
                );
            }
        }
    }


    function captureRects(
        skip = null
    ) {
        const result =
            new Map();

        for (
            const node
            of major.values()
        ) {
            if (node === skip) {
                continue;
            }

            result.set(
                node,
                node.getBoundingClientRect()
            );
        }

        return result;
    }


    function animateFrom(
        before,
        skip = null
    ) {
        for (
            const [node, oldRect]
            of before
        ) {
            if (node === skip) {
                continue;
            }

            const newRect =
                node.getBoundingClientRect();

            const dx =
                oldRect.left
                -
                newRect.left;

            if (
                Math.abs(dx) < 0.5
            ) {
                continue;
            }

            node.animate(
                [
                    {
                        transform:
                            `translate3d(${dx}px,0,0)`
                    },
                    {
                        transform:
                            "translate3d(0,0,0)"
                    }
                ],
                {
                    duration:
                        320,

                    easing:
                        "cubic-bezier(.2,.85,.25,1)"
                }
            );
        }
    }


    function targetIndex(clientX) {
        const rect =
            majorShell
            .getBoundingClientRect();

        const ratio =
            Math.max(
                0,
                Math.min(
                    .999999,
                    (
                        clientX
                        -
                        rect.left
                    )
                    /
                    Math.max(
                        1,
                        rect.width
                    )
                )
            );

        if (ratio < 1 / 3) {
            return 0;
        }

        if (ratio < 2 / 3) {
            return 1;
        }

        return 2;
    }


    function candidateOrder(
        key,
        index,
        baseOrder
    ) {
        const result =
            baseOrder.filter(
                item =>
                    item !== key
            );

        result.splice(
            index,
            0,
            key
        );

        return result;
    }


    function sameOrder(a, b) {
        return (
            a.length === b.length
            &&
            a.every(
                (value, index) =>
                    value === b[index]
            )
        );
    }


    function dragMove(event) {
        const drag =
            dragState;

        if (
            !drag
            ||
            event.pointerId
            !== drag.pointerId
        ) {
            return;
        }

        event.preventDefault();

        const desiredLeft =
            event.clientX
            -
            drag.grabOffset;

        drag.dx =
            desiredLeft
            -
            drag.baseLeft;

        drag.node.style.transform =
            `translate3d(${drag.dx}px,0,0)`;

        const candidate =
            candidateOrder(
                drag.key,
                targetIndex(
                    event.clientX
                ),
                drag.startOrder
            );

        if (
            sameOrder(
                candidate,
                drag.currentOrder
            )
        ) {
            return;
        }

        const before =
            captureRects(
                drag.node
            );

        const visualLeft =
            drag.node
            .getBoundingClientRect()
            .left;

        applyOrder(
            candidate
        );

        const after =
            drag.node
            .getBoundingClientRect();

        const untransformedLeft =
            after.left
            -
            drag.dx;

        drag.baseLeft =
            untransformedLeft;

        drag.dx =
            visualLeft
            -
            drag.baseLeft;

        drag.node.style.transform =
            `translate3d(${drag.dx}px,0,0)`;

        animateFrom(
            before,
            drag.node
        );

        drag.currentOrder =
            [...candidate];
    }


    function finishDrag(event) {
        const drag =
            dragState;

        if (
            !drag
            ||
            event.pointerId
            !== drag.pointerId
        ) {
            return;
        }

        event.preventDefault();

        try {
            drag.handle
            .releasePointerCapture(
                event.pointerId
            );
        }
        catch (_) {}

        drag.handle.classList.remove(
            "fd16-active"
        );

        drag.node.style.transition =
            "transform 320ms cubic-bezier(.2,.85,.25,1)";

        drag.node.style.transform =
            "translate3d(0,0,0)";

        window.setTimeout(
            () => {
                drag.node.classList.remove(
                    "fd16-major-following"
                );

                drag.node.style.removeProperty(
                    "transform"
                );

                drag.node.style.removeProperty(
                    "transition"
                );
            },
            330
        );

        try {
            localStorage.setItem(
                "fullDashSlamMajorOrderV16",
                JSON.stringify(
                    drag.currentOrder
                )
            );
        }
        catch (_) {}

        document.removeEventListener(
            "pointermove",
            dragMove,
            true
        );

        document.removeEventListener(
            "pointerup",
            finishDrag,
            true
        );

        document.removeEventListener(
            "pointercancel",
            finishDrag,
            true
        );

        dragState =
            null;
    }


    function startDrag(
        event,
        key,
        node,
        handle
    ) {
        if (
            event.button !== 0
            ||
            dragState
        ) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        const rect =
            node.getBoundingClientRect();

        const order =
            currentOrder();

        dragState = {
            key,
            node,
            handle,

            pointerId:
                event.pointerId,

            grabOffset:
                event.clientX
                -
                rect.left,

            baseLeft:
                rect.left,

            dx:
                0,

            startOrder:
                [...order],

            currentOrder:
                [...order],
        };

        node.classList.add(
            "fd16-major-following"
        );

        handle.classList.add(
            "fd16-active"
        );

        try {
            handle.setPointerCapture(
                event.pointerId
            );
        }
        catch (_) {}

        document.addEventListener(
            "pointermove",
            dragMove,
            true
        );

        document.addEventListener(
            "pointerup",
            finishDrag,
            true
        );

        document.addEventListener(
            "pointercancel",
            finishDrag,
            true
        );
    }


    function installDrag() {
        if (!findMajor()) {
            return;
        }

        document
            .querySelectorAll(
                ".fd-slam-major-handle-v5,"
                +
                ".fd-slam-major-handle-v8,"
                +
                ".fd151-live-handle,"
                +
                ".fd16-major-handle"
            )
            .forEach(
                node =>
                    node.remove()
            );

        for (
            const [key, node]
            of major
        ) {
            const handle =
                document.createElement(
                    "button"
                );

            handle.type =
                "button";

            handle.className =
                "fd16-major-handle";

            handle.setAttribute(
                "aria-label",
                `Move ${key} section`
            );

            const grip =
                document.createElement(
                    "span"
                );

            grip.className =
                "fd16-major-grip";

            handle.appendChild(
                grip
            );

            node.prepend(
                handle
            );

            handle.addEventListener(
                "pointerdown",
                event =>
                    startDrag(
                        event,
                        key,
                        node,
                        handle
                    ),
                true
            );
        }

        try {
            const saved =
                JSON.parse(
                    localStorage
                    .getItem(
                        "fullDashSlamMajorOrderV16"
                    )
                    ||
                    "null"
                );

            if (
                Array.isArray(saved)
                &&
                saved.length === 3
                &&
                [
                    "robot",
                    "center",
                    "car"
                ]
                .every(
                    key =>
                        saved.includes(key)
                )
            ) {
                applyOrder(saved);
            }
        }
        catch (_) {}
    }


    /* ========================================================
       9. STATE HOOK
       ======================================================== */

    const previousSync =
        window.fullDashSyncV15;

    window.fullDashSyncV15 =
        next => {
            if (
                typeof previousSync
                ===
                "function"
            ) {
                previousSync(next);
            }

            requestAnimationFrame(
                syncIndicators
            );
        };


    function boot() {
        renameMappingStart();

        cleanCenterTop();

        removeCarHelp();

        styleActions();

        normalizeText();

        setupRanges();

        styleAngles();


        syncIndicators();

        installDrag();
    }


    if (
        document.readyState
        ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once: true
            }
        );
    }

    else {
        boot();
    }


    /*
     * Finite late cleanup only.
     * Old finite builders may finish immediately after DOM ready.
     */
    window.setTimeout(
        () => {
            cleanCenterTop();
            removeCarHelp();
            styleActions();
            syncIndicators();
            installDrag();
        },
        350
    );


    window.addEventListener(
        "resize",
        syncIndicators
    );

})();

/* FULL_DASH_SLAM_PARITY_V161 */
(function () {
    if (window.__FD_SLAM_V161__) return;
    window.__FD_SLAM_V161__ = true;

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const lower = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

    function hideExtraTopText() {
        const top = document.querySelector(".workspace > .topbar");
        if (!top) return;

        $$("button, span, div", top).forEach(node => {
            const t = lower(node.textContent);
            if (
                t === "cyclonedds" ||
                t === "slam map → xy" ||
                t === "slam map -> xy"
            ) {
                node.style.setProperty("display", "none", "important");
            }
        });

        const poseBar = top.querySelector(".pose-bar");
        if (poseBar) {
            poseBar.style.setProperty("margin-right", "auto", "important");
            poseBar.style.setProperty("order", "-100", "important");
        }
    }


    function removeCarHelp() {
        const phrases = [
            "click and drag for position and direction",
            "runs directly on the geometry of both maps",
            "in direct mode, the car navigates on its own map",
        ];

        $$(".car-side p, .car-side .help, .car-side .subtext, .car-side .hint").forEach(node => {
            const t = lower(node.textContent);
            if (phrases.some(p => t.includes(p))) {
                node.classList.add("fd16-hidden");
            }
        });
    }

    function styleRightChecks() {
        const scope = document.querySelector(".car-side");
        if (!scope) return;

        $$("label, .checkbox, .toggle, .legend-item, .option-row", scope).forEach(node => {
            const t = lower(node.textContent);
            if (t.includes("car map") || t.includes("car scan")) {
                node.classList.add("fd16-small-check");
            }
        });
    }

    function normalizeBottomStrip() {
        $$(".workspace > .metrics .metric").forEach(card => {
            card.querySelectorAll(".dot, .metric-dot, .status-dot").forEach(n => n.remove());

            const value = card.querySelector("b, strong, .metric-value");
            if (!value) return;

            const t = value.textContent.trim().toLowerCase();
            if (t === "no data") {
                value.innerHTML = '<span class="fd16-mini-line"></span>';
            }
        });
    }

    function centerKeyboardButton() {
        for (const node of $$("button, div, span, strong")) {
            if (lower(node.textContent.replace(/^[^\w]+/, "")) === "keyboard control") {
                const host =
                    node.closest(".teleop-capture, .keyboard-control, .keyboard-help")
                    || node.parentElement;

                if (host) {
                    host.classList.add("fd16-keyboard-action");
                    host.style.setProperty("justify-content", "center", "important");
                    host.style.setProperty("text-align", "center", "important");
                }
            }
        }
    }

    function polishMappingButtons() {
        const root = document.getElementById("fd15MappingControls");
        if (!root) return;

        const startSeg = root.querySelector(".fd15-live-switch:first-child .fd15-left");
        if (startSeg) {
            const label = lower(startSeg.textContent);
            if (label.includes("start")) {
                const icon = startSeg.querySelector(".fd15-icon");
                startSeg.replaceChildren();
                if (icon) startSeg.appendChild(icon);
                const span = document.createElement("span");
                span.textContent = "Start";
                startSeg.appendChild(span);
            }
        }

        const pauseSeg = root.querySelector(".fd15-live-switch:nth-child(2) .fd15-left");
        if (pauseSeg) {
            const icon = pauseSeg.querySelector(".fd15-icon");
            pauseSeg.replaceChildren();
            if (icon) pauseSeg.appendChild(icon);
            const span = document.createElement("span");
            span.textContent = "Pause";
            pauseSeg.appendChild(span);
        }
    }

    function run() {
        hideExtraTopText();
        removeCarHelp();
        styleRightChecks();
        normalizeBottomStrip();
        centerKeyboardButton();
        polishMappingButtons();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run);
    } else {
        run();
    }

    /* V16.2: retired V16.1 finite cosmetic loop. */
})();

/* ============================================================
   FULL_DASH_SLAM_PARITY_JS_V162
   ============================================================ */
(() => {
    "use strict";

    if (window.__FULL_DASH_SLAM_V162__) return;
    window.__FULL_DASH_SLAM_V162__ = true;

    const $ = id => document.getElementById(id);

    const lower = value =>
        String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    function cssName(name) {
        return name.replace(
            /[A-Z]/g,
            c => "-" + c.toLowerCase()
        );
    }

    function copyComputed(
        source,
        target,
        properties
    ) {
        if (!source || !target) return;

        const view =
            source.ownerDocument
                .defaultView;

        const style =
            view.getComputedStyle(
                source
            );

        for (const prop of properties) {
            const value = style[prop];

            if (value) {
                target.style.setProperty(
                    cssName(prop),
                    value,
                    "important"
                );
            }
        }
    }

    function parentDocument() {
        try {
            if (
                window.parent
                && window.parent !== window
                && window.parent.document
            ) {
                return window.parent.document;
            }
        }
        catch (_) {}

        return null;
    }

    function setSegmentContent(
        node,
        icon,
        label
    ) {
        if (!node) return;

        node.replaceChildren();

        const iconNode =
            document.createElement(
                "span"
            );

        iconNode.className =
            "fd162-icon";

        iconNode.setAttribute(
            "aria-hidden",
            "true"
        );

        iconNode.textContent =
            icon;

        const labelNode =
            document.createElement(
                "span"
            );

        labelNode.textContent =
            label;

        node.append(
            iconNode,
            labelNode
        );
    }

    function restoreMappingIcons() {
        const root =
            $("fd15MappingControls");

        if (!root) return;

        const switches =
            root.querySelectorAll(
                ".fd15-live-switch"
            );

        if (switches[0]) {
            setSegmentContent(
                switches[0]
                    .querySelector(
                        ".fd15-left"
                    ),
                "◇",
                "Start"
            );

            setSegmentContent(
                switches[0]
                    .querySelector(
                        ".fd15-right"
                    ),
                "×",
                "Stop"
            );
        }

        if (switches[1]) {
            setSegmentContent(
                switches[1]
                    .querySelector(
                        ".fd15-left"
                    ),
                "Ⅱ",
                "Pause"
            );

            setSegmentContent(
                switches[1]
                    .querySelector(
                        ".fd15-right"
                    ),
                "▶",
                "Resume"
            );
        }
    }

    const previousSync =
        window.fullDashSyncV15;

    window.fullDashSyncV15 =
        next => {
            if (
                typeof previousSync
                ===
                "function"
            ) {
                previousSync(next);
            }

            requestAnimationFrame(
                restoreMappingIcons
            );
        };

    function mirrorLiveCenterChrome() {
        const pd =
            parentDocument();

        if (!pd) return;

        const liveStatus =
            pd.querySelector(
                "#view-live .stitch-twin-statusbar"
            );

        const topbar =
            document.querySelector(
                ".workspace > .topbar"
            );

        const workspace =
            document.querySelector(
                ".workspace"
            );

        if (
            liveStatus
            && topbar
        ) {
            const cs =
                pd.defaultView
                    .getComputedStyle(
                        liveStatus
                    );

            const bg =
                cs.backgroundColor
                || "#121313";

            topbar.style.setProperty(
                "background",
                bg,
                "important"
            );

            topbar.style.setProperty(
                "background-color",
                bg,
                "important"
            );

            workspace?.style.setProperty(
                "--fd162-center-chrome",
                bg
            );
        }

        const reset =
            pd.querySelector(
                "#view-live #twinResetBtn"
            );

        const actionProps = [
            "height",
            "minHeight",
            "maxHeight",
            "paddingTop",
            "paddingRight",
            "paddingBottom",
            "paddingLeft",
            "background",
            "backgroundColor",
            "backgroundImage",
            "borderTopWidth",
            "borderTopStyle",
            "borderTopColor",
            "borderRightWidth",
            "borderRightStyle",
            "borderRightColor",
            "borderBottomWidth",
            "borderBottomStyle",
            "borderBottomColor",
            "borderLeftWidth",
            "borderLeftStyle",
            "borderLeftColor",
            "borderRadius",
            "boxShadow",
            "color",
            "fontFamily",
            "fontSize",
            "fontWeight",
            "lineHeight",
            "letterSpacing",
        ];

        if (
            reset
            && topbar
        ) {
            [
                ...topbar.querySelectorAll(
                    "button"
                )
            ].forEach(button => {
                const text =
                    lower(
                        button.textContent
                    );

                if (
                    text === "follow robot"
                    || text === "fit view"
                    || text === "+"
                    || text === "-"
                ) {
                    button.classList.add(
                        "fd162-center-action"
                    );

                    copyComputed(
                        reset,
                        button,
                        actionProps
                    );

                    button.style.setProperty(
                        "display",
                        "inline-flex",
                        "important"
                    );

                    button.style.setProperty(
                        "align-items",
                        "center",
                        "important"
                    );

                    button.style.setProperty(
                        "justify-content",
                        "center",
                        "important"
                    );

                    if (
                        text === "+"
                        || text === "-"
                    ) {
                        button.style.setProperty(
                            "padding-left",
                            "0",
                            "important"
                        );

                        button.style.setProperty(
                            "padding-right",
                            "0",
                            "important"
                        );
                    }
                }
            });
        }

        const liveStats =
            pd.querySelector(
                "#view-live .robot-mini-grid.twin-stats"
            );

        const slamStats =
            document.querySelector(
                ".workspace > .metrics"
            );

        if (
            liveStats
            && slamStats
        ) {
            copyComputed(
                liveStats,
                slamStats,
                [
                    "height",
                    "minHeight",
                    "maxHeight",
                    "background",
                    "backgroundColor",
                    "borderTopWidth",
                    "borderTopStyle",
                    "borderTopColor",
                    "borderRadius",
                    "boxShadow",
                    "overflow",
                ]
            );

            const liveCell =
                liveStats.querySelector(
                    ":scope > div"
                );

            const liveLabel =
                liveCell?.querySelector(
                    "span"
                );

            const liveValue =
                liveCell?.querySelector(
                    "strong"
                );

            slamStats
                .querySelectorAll(
                    ":scope > .metric"
                )
                .forEach(cell => {
                    copyComputed(
                        liveCell,
                        cell,
                        [
                            "height",
                            "minHeight",
                            "background",
                            "backgroundColor",
                            "borderRightWidth",
                            "borderRightStyle",
                            "borderRightColor",
                            "paddingTop",
                            "paddingRight",
                            "paddingBottom",
                            "paddingLeft",
                        ]
                    );

                    const label =
                        cell.querySelector(
                            "small"
                        );

                    const value =
                        cell.querySelector(
                            "b, strong, .metric-value"
                        );

                    copyComputed(
                        liveLabel,
                        label,
                        [
                            "fontFamily",
                            "fontSize",
                            "fontWeight",
                            "lineHeight",
                            "letterSpacing",
                            "color",
                            "textTransform",
                        ]
                    );

                    copyComputed(
                        liveValue,
                        value,
                        [
                            "fontFamily",
                            "fontSize",
                            "fontWeight",
                            "lineHeight",
                            "letterSpacing",
                            "color",
                            "textTransform",
                        ]
                    );
                });
        }
    }

    function cleanBottomStrip() {
        const strip =
            document.querySelector(
                ".workspace > .metrics"
            );

        if (!strip) return;

        strip
            .querySelectorAll(
                ".status-dot, .dot, .metric-dot"
            )
            .forEach(dot => {
                dot.style.setProperty(
                    "display",
                    "none",
                    "important"
                );
            });

        strip
            .querySelectorAll(
                ".metric"
            )
            .forEach(cell => {
                const label =
                    cell.querySelector(
                        "small"
                    );

                const value =
                    cell.querySelector(
                        "b, strong, .metric-value"
                    );

                if (label) {
                    label.textContent =
                        label.textContent
                            .trim()
                            .toUpperCase();
                }

                if (
                    value
                    && lower(
                        value.textContent
                    )
                    ===
                    "no data"
                ) {
                    value.textContent =
                        "—";
                }
            });
    }

    const dropdowns =
        new Map();

    function presentedLabel(
        option
    ) {
        if (!option) return "";

        return option.textContent
            .replace(
                /\s*\(v3\)\s*/gi,
                ""
            )
            .trim();
    }

    function hidePresentedOption(
        select,
        option
    ) {
        return (
            select.id ===
                "car-pick-mode"
            &&
            option.value ===
                "car-tf"
        );
    }

    function enhanceSelect(
        select,
        fallbackLabel
    ) {
        if (
            !select
            || dropdowns.has(select)
        ) {
            return;
        }

        select.classList.add(
            "fd162-native-select"
        );

        const root =
            document.createElement(
                "div"
            );

        root.className =
            "fd162-dropdown";

        const trigger =
            document.createElement(
                "button"
            );

        trigger.type =
            "button";

        trigger.className =
            "fd162-dropdown-trigger";

        trigger.setAttribute(
            "aria-haspopup",
            "listbox"
        );

        trigger.setAttribute(
            "aria-expanded",
            "false"
        );

        const label =
            document.createElement(
                "span"
            );

        label.className =
            "fd162-dropdown-label";

        const chevron =
            document.createElement(
                "span"
            );

        chevron.className =
            "fd162-dropdown-chevron";

        chevron.setAttribute(
            "aria-hidden",
            "true"
        );

        trigger.append(
            label,
            chevron
        );

        root.appendChild(
            trigger
        );

        select.insertAdjacentElement(
            "afterend",
            root
        );

        const menu =
            document.createElement(
                "div"
            );

        menu.className =
            "fd162-dropdown-menu";

        menu.setAttribute(
            "role",
            "listbox"
        );

        menu.hidden = true;

        document.body.appendChild(
            menu
        );

        function selectedOption() {
            return (
                select.options[
                    select.selectedIndex
                ]
                || null
            );
        }

        function displayLabel() {
            const option =
                selectedOption();

            const text =
                presentedLabel(
                    option
                );

            if (
                !select.value
                || !text
            ) {
                return fallbackLabel;
            }

            return text;
        }

        function positionMenu() {
            if (menu.hidden) return;

            const rect =
                trigger
                    .getBoundingClientRect();

            menu.style.left =
                `${Math.round(rect.left)}px`;

            menu.style.top =
                `${Math.round(rect.bottom + 5)}px`;

            menu.style.width =
                `${Math.round(rect.width)}px`;
        }

        function close() {
            if (menu.hidden) return;

            menu.hidden = true;

            root.classList.remove(
                "open"
            );

            trigger.setAttribute(
                "aria-expanded",
                "false"
            );
        }

        function rebuild() {
            menu.replaceChildren();

            [
                ...select.options
            ].forEach(option => {
                if (
                    hidePresentedOption(
                        select,
                        option
                    )
                ) {
                    return;
                }

                const button =
                    document.createElement(
                        "button"
                    );

                button.type =
                    "button";

                button.className =
                    "fd162-dropdown-option";

                button.dataset.value =
                    option.value;

                button.textContent =
                    presentedLabel(
                        option
                    );

                const active =
                    option.value
                    ===
                    select.value;

                button.classList.toggle(
                    "selected",
                    active
                );

                button.setAttribute(
                    "aria-selected",
                    active
                    ?
                    "true"
                    :
                    "false"
                );

                button.addEventListener(
                    "click",
                    () => {
                        if (
                            select.value
                            !==
                            option.value
                        ) {
                            select.value =
                                option.value;

                            select.dispatchEvent(
                                new Event(
                                    "change",
                                    {
                                        bubbles:
                                            true
                                    }
                                )
                            );
                        }

                        sync();
                        close();
                        trigger.focus();
                    }
                );

                menu.appendChild(
                    button
                );
            });
        }

        function sync() {
            label.textContent =
                displayLabel();

            trigger.disabled =
                !!select.disabled;

            menu
                .querySelectorAll(
                    ".fd162-dropdown-option"
                )
                .forEach(button => {
                    const active =
                        button.dataset.value
                        ===
                        select.value;

                    button.classList.toggle(
                        "selected",
                        active
                    );

                    button.setAttribute(
                        "aria-selected",
                        active
                        ?
                        "true"
                        :
                        "false"
                    );
                });
        }

        function open() {
            if (
                trigger.disabled
            ) {
                return;
            }

            rebuild();
            sync();

            menu.hidden =
                false;

            root.classList.add(
                "open"
            );

            trigger.setAttribute(
                "aria-expanded",
                "true"
            );

            positionMenu();
        }

        trigger.addEventListener(
            "click",
            event => {
                event.preventDefault();

                if (menu.hidden) {
                    open();
                }
                else {
                    close();
                }
            }
        );

        trigger.addEventListener(
            "keydown",
            event => {
                if (
                    event.key
                    ===
                    "Escape"
                ) {
                    close();
                    return;
                }

                if (
                    event.key
                    ===
                    "ArrowDown"
                    ||
                    event.key
                    ===
                    "ArrowUp"
                ) {
                    event.preventDefault();
                    open();

                    const buttons =
                        [
                            ...menu
                                .querySelectorAll(
                                    ".fd162-dropdown-option"
                                )
                        ];

                    const index =
                        Math.max(
                            0,
                            buttons.findIndex(
                                button =>
                                    button
                                        .dataset
                                        .value
                                    ===
                                    select.value
                            )
                        );

                    buttons[index]?.focus();
                }
            }
        );

        document.addEventListener(
            "pointerdown",
            event => {
                if (
                    !root.contains(
                        event.target
                    )
                    &&
                    !menu.contains(
                        event.target
                    )
                ) {
                    close();
                }
            }
        );

        window.addEventListener(
            "resize",
            positionMenu
        );

        window.addEventListener(
            "scroll",
            positionMenu,
            true
        );

        select.addEventListener(
            "change",
            sync
        );

        dropdowns.set(
            select,
            {
                root,
                trigger,
                menu,
                sync,
                close,
            }
        );

        sync();
    }

    function setupCarDropdowns() {
        enhanceSelect(
            $("car-pick-mode"),
            "G1 destination"
        );

        enhanceSelect(
            $("car-maps"),
            "Select map"
        );
    }

    function styleCarRefresh() {
        const target =
            $("car-refresh-maps");

        if (!target) return;

        target.classList.add(
            "fd162-refresh"
        );

        const source =
            $("refresh-maps")
            ||
            $("refresh-partials");

        if (!source) return;

        copyComputed(
            source,
            target,
            [
                "width",
                "minWidth",
                "height",
                "minHeight",
                "paddingTop",
                "paddingRight",
                "paddingBottom",
                "paddingLeft",
                "background",
                "backgroundColor",
                "backgroundImage",
                "borderTopWidth",
                "borderTopStyle",
                "borderTopColor",
                "borderRightWidth",
                "borderRightStyle",
                "borderRightColor",
                "borderBottomWidth",
                "borderBottomStyle",
                "borderBottomColor",
                "borderLeftWidth",
                "borderLeftStyle",
                "borderLeftColor",
                "borderRadius",
                "boxShadow",
                "color",
                "fontFamily",
                "fontSize",
                "fontWeight",
                "lineHeight",
            ]
        );
    }

    function boot() {
        restoreMappingIcons();
        mirrorLiveCenterChrome();
        cleanBottomStrip();
        setupCarDropdowns();
        styleCarRefresh();
    }

    if (
        document.readyState
        ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once: true
            }
        );
    }
    else {
        boot();
    }

    window.addEventListener(
        "load",
        boot,
        {
            once: true
        }
    );

    window.addEventListener(
        "resize",
        mirrorLiveCenterChrome
    );

    setTimeout(
        boot,
        250
    );

    setTimeout(
        boot,
        1000
    );
})();

/* ============================================================
   FULL_DASH_SLAM_PARITY_JS_V163
   ============================================================ */

(() => {
    "use strict";

    if (
        window.__FULL_DASH_SLAM_V163__
    ) {
        return;
    }

    window.__FULL_DASH_SLAM_V163__ =
        true;


    const $ =
        id =>
            document.getElementById(
                id
            );


    const norm =
        value =>
            String(
                value?.textContent
                ??
                value
                ??
                ""
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim()
            .toLowerCase();


    function cssName(
        property
    ) {
        return property.replace(
            /[A-Z]/g,
            c =>
                "-"
                +
                c.toLowerCase()
        );
    }


    function copyComputed(
        source,
        target,
        properties
    ) {
        if (
            !source
            ||
            !target
        ) {
            return;
        }

        const view =
            source
                .ownerDocument
                .defaultView;

        const style =
            view.getComputedStyle(
                source
            );

        for (
            const property
            of properties
        ) {
            const value =
                style[property];

            if (
                value !== undefined
                &&
                value !== null
                &&
                value !== ""
            ) {
                target.style.setProperty(
                    cssName(
                        property
                    ),
                    value,
                    "important"
                );
            }
        }
    }


    function parentDocument() {
        try {
            if (
                window.parent
                &&
                window.parent !== window
                &&
                window.parent.document
            ) {
                return window
                    .parent
                    .document;
            }
        }
        catch (_) {}

        return null;
    }


    /* ========================================================
       1. MAPPING PAUSE ICON = NAVIGATION PAUSE ICON
       ======================================================== */

    function exactPauseSource() {
        const mapping =
            $("fd15MappingControls");

        for (
            const button
            of document.querySelectorAll(
                "button"
            )
        ) {
            if (
                mapping?.contains(
                    button
                )
                ||
                button.id
                ===
                "pause-map"
            ) {
                continue;
            }

            if (
                norm(button)
                !==
                "pause"
            ) {
                continue;
            }

            const style =
                getComputedStyle(
                    button
                );

            if (
                style.display
                ===
                "none"
                ||
                style.visibility
                ===
                "hidden"
            ) {
                continue;
            }

            if (
                button
                    .getBoundingClientRect()
                    .width
                <=
                0
            ) {
                continue;
            }

            return button;
        }

        return null;
    }


    function syncMappingPauseIcon() {
        const root =
            $("fd15MappingControls");

        if (!root) return;

        const switches =
            root.querySelectorAll(
                ".fd15-live-switch"
            );

        const target =
            switches[1]
                ?.querySelector(
                    ".fd15-left"
                );

        const source =
            exactPauseSource();

        if (
            target
            &&
            source
        ) {
            target.replaceChildren(
                ...[
                    ...source.childNodes
                ].map(
                    node =>
                        node.cloneNode(
                            true
                        )
                )
            );

            if (
                norm(target)
                !==
                "pause"
            ) {
                target.textContent =
                    source.textContent;
            }
        }
    }


    /* ========================================================
       2. XR / FAULT TYPOGRAPHY
       ======================================================== */

    const TYPE_PROPS = [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "lineHeight",
        "letterSpacing",
        "textTransform",
        "color",
        "opacity",
        "textShadow",
    ];


    function targetFieldLabels() {
        const result =
            new Set();

        document
            .querySelectorAll(
                ".mapping-progress span,"
                +
                ".mapping-progress b"
            )
            .forEach(
                node =>
                    result.add(
                        node
                    )
            );

        for (
            const label
            of document.querySelectorAll(
                ".field-label"
            )
        ) {
            const text =
                norm(label);

            if (
                text === "map name"
                ||
                text === "final map name"
                ||
                text === "initial pose"
            ) {
                result.add(
                    label
                );
            }
        }

        for (
            const inputId
            of [
                "initial-x",
                "initial-y",
                "initial-yaw",
                "goal-x",
                "goal-y",
                "goal-yaw",
            ]
        ) {
            const input =
                $(inputId);

            const label =
                input?.closest(
                    "label"
                );

            if (label) {
                result.add(
                    label
                );
            }
        }

        return [
            ...result
        ];
    }


    function syncXrTypography() {
        const pd =
            parentDocument();

        const liveLabel =
            pd?.querySelector(
                "#view-live "
                +
                ".health-item "
                +
                "> span:first-child"
            );

        const fallback = {
            fontFamily:
                '"Plus Jakarta Sans", system-ui, sans-serif',
            fontSize:
                "12px",
            fontWeight:
                "400",
            lineHeight:
                "16px",
            letterSpacing:
                "0px",
            textTransform:
                "none",
            color:
                "rgb(140, 150, 167)",
        };


        for (
            const node
            of targetFieldLabels()
        ) {
            node.classList.add(
                "fd163-xr-type"
            );

            if (liveLabel) {
                copyComputed(
                    liveLabel,
                    node,
                    TYPE_PROPS
                );
            }
            else {
                for (
                    const [
                        key,
                        value
                    ]
                    of Object.entries(
                        fallback
                    )
                ) {
                    node.style.setProperty(
                        cssName(key),
                        value,
                        "important"
                    );
                }
            }
        }
    }


    /* ========================================================
       3. BOTTOM TELEMETRY = LIVE TWIN STATS
       ======================================================== */

    function syncBottomTelemetry() {
        const footer =
            document.querySelector(
                ".workspace "
                +
                "> footer.telemetry"
            );

        if (!footer) return;

        footer
            .querySelectorAll(
                ".status-dot,"
                +
                ".dot,"
                +
                ".metric-dot"
            )
            .forEach(
                node =>
                    node.style
                        .setProperty(
                            "display",
                            "none",
                            "important"
                        )
            );


        const pd =
            parentDocument();

        const live =
            pd?.querySelector(
                "#view-live "
                +
                ".robot-mini-grid"
                +
                ".twin-stats"
            );

        const liveCell =
            live?.querySelector(
                ":scope > div"
            );

        const liveLabel =
            liveCell?.querySelector(
                "span"
            );

        const liveValue =
            liveCell?.querySelector(
                "strong"
            );


        if (live) {
            copyComputed(
                live,
                footer,
                [
                    "height",
                    "minHeight",
                    "maxHeight",
                    "background",
                    "backgroundColor",
                    "backgroundImage",
                    "borderTopWidth",
                    "borderTopStyle",
                    "borderTopColor",
                    "borderRadius",
                    "boxShadow",
                    "overflow",
                ]
            );
        }


        footer
            .querySelectorAll(
                ":scope > .metric"
            )
            .forEach(
                cell => {
                    if (liveCell) {
                        copyComputed(
                            liveCell,
                            cell,
                            [
                                "height",
                                "minHeight",
                                "background",
                                "backgroundColor",
                                "backgroundImage",
                                "borderRightWidth",
                                "borderRightStyle",
                                "borderRightColor",
                                "paddingTop",
                                "paddingRight",
                                "paddingBottom",
                                "paddingLeft",
                            ]
                        );
                    }

                    const label =
                        cell.querySelector(
                            "small"
                        );

                    const value =
                        cell.querySelector(
                            "b, strong"
                        );

                    if (
                        liveLabel
                        &&
                        label
                    ) {
                        copyComputed(
                            liveLabel,
                            label,
                            TYPE_PROPS
                        );
                    }

                    if (
                        liveValue
                        &&
                        value
                    ) {
                        copyComputed(
                            liveValue,
                            value,
                            TYPE_PROPS
                        );
                    }

                    if (
                        value
                        &&
                        (
                            norm(value)
                            ===
                            "no data"
                            ||
                            norm(value)
                            ===
                            "fără date"
                        )
                    ) {
                        value.textContent =
                            "—";
                    }
                }
            );
    }


    /* ========================================================
       4. RETIRE OLD DROPDOWN PRESENTATIONS
       ======================================================== */

    const TARGET_SELECT_IDS = [
        "partial-sessions",
        "maps",
        "car-pick-mode",
        "car-maps",
    ];


    function retireOldDropdownPresentation() {
        const selectors = [
            ".fd-partial-dropdown-v6",
            ".fd-map-dropdown-v7",
            ".fd162-dropdown",
            "body > .fd-partial-menu-v6",
            "body > .fd-map-menu-v7",
            "body > .fd162-dropdown-menu",
        ];

        document
            .querySelectorAll(
                selectors.join(",")
            )
            .forEach(
                node =>
                    node.remove()
            );


        for (
            const id
            of TARGET_SELECT_IDS
        ) {
            const select =
                $(id);

            if (!select) continue;

            const parent =
                select.parentElement;

            if (!parent) continue;

            for (
                const child
                of [
                    ...parent.children
                ]
            ) {
                if (
                    child
                    ===
                    select
                    ||
                    child.classList
                        .contains(
                            "fd163-dropdown"
                        )
                ) {
                    continue;
                }

                if (
                    child.id
                    ===
                    "refresh-partials"
                    ||
                    child.id
                    ===
                    "refresh-maps"
                    ||
                    child.id
                    ===
                    "car-refresh-maps"
                ) {
                    continue;
                }

                const cls =
                    String(
                        child.className
                        ||
                        ""
                    );

                if (
                    /dropdown|select-trigger|select-menu/i
                        .test(
                            cls
                        )
                ) {
                    child.remove();
                }
            }
        }
    }


    /* ========================================================
       5. COMPOSITE-EXACT DROPDOWN OWNER
       ======================================================== */

    const dropdowns =
        new Map();


    const TRIGGER_PROPS = [
        "height",
        "minHeight",
        "maxHeight",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "background",
        "backgroundColor",
        "backgroundImage",
        "borderTopWidth",
        "borderTopStyle",
        "borderTopColor",
        "borderRightWidth",
        "borderRightStyle",
        "borderRightColor",
        "borderBottomWidth",
        "borderBottomStyle",
        "borderBottomColor",
        "borderLeftWidth",
        "borderLeftStyle",
        "borderLeftColor",
        "borderRadius",
        "boxShadow",
        "fontFamily",
        "fontSize",
        "fontWeight",
        "lineHeight",
        "letterSpacing",
        "textTransform",
        "color",
    ];


    const MENU_PROPS = [
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "background",
        "backgroundColor",
        "backgroundImage",
        "borderTopWidth",
        "borderTopStyle",
        "borderTopColor",
        "borderRightWidth",
        "borderRightStyle",
        "borderRightColor",
        "borderBottomWidth",
        "borderBottomStyle",
        "borderBottomColor",
        "borderLeftWidth",
        "borderLeftStyle",
        "borderLeftColor",
        "borderRadius",
        "boxShadow",
    ];


    const OPTION_PROPS = [
        "height",
        "minHeight",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "marginTop",
        "marginRight",
        "marginBottom",
        "marginLeft",
        "background",
        "backgroundColor",
        "backgroundImage",
        "borderTopWidth",
        "borderTopStyle",
        "borderTopColor",
        "borderRightWidth",
        "borderRightStyle",
        "borderRightColor",
        "borderBottomWidth",
        "borderBottomStyle",
        "borderBottomColor",
        "borderLeftWidth",
        "borderLeftStyle",
        "borderLeftColor",
        "borderRadius",
        "boxShadow",
        "fontFamily",
        "fontSize",
        "fontWeight",
        "lineHeight",
        "letterSpacing",
        "textTransform",
        "color",
    ];


    function compositeReferences() {
        const pd =
            parentDocument();

        return {
            trigger:
                pd?.querySelector(
                    "#stitchHealthDropdownV174 "
                    +
                    ".stitch-health-trigger-v174"
                )
                ||
                null,

            menu:
                pd?.querySelector(
                    "body > "
                    +
                    ".stitch-health-menu-v174"
                )
                ||
                null,

            option:
                pd?.querySelector(
                    "body > "
                    +
                    ".stitch-health-menu-v174 "
                    +
                    ".stitch-health-option-v174"
                    +
                    ":not(.selected)"
                )
                ||
                pd?.querySelector(
                    "body > "
                    +
                    ".stitch-health-menu-v174 "
                    +
                    ".stitch-health-option-v174"
                )
                ||
                null,

            selected:
                pd?.querySelector(
                    "body > "
                    +
                    ".stitch-health-menu-v174 "
                    +
                    ".stitch-health-option-v174"
                    +
                    ".selected"
                )
                ||
                null,
        };
    }


    function presentedLabel(
        select,
        option,
        fallback
    ) {
        if (
            !option
            ||
            !select.value
        ) {
            return fallback;
        }

        return String(
            option.textContent
            ||
            ""
        )
        .replace(
            /\s*\(v3\)\s*/gi,
            ""
        )
        .trim()
        ||
        fallback;
    }


    function optionVisible(
        select,
        option
    ) {
        if (
            select.id
            ===
            "car-pick-mode"
            &&
            option.value
            ===
            "car-tf"
        ) {
            return false;
        }

        return true;
    }


    function enhanceSelect(
        select,
        fallback
    ) {
        if (!select) return;

        const existing =
            dropdowns.get(
                select
            );

        if (
            existing
            &&
            existing.root.isConnected
        ) {
            existing.sync();
            return;
        }


        select.style.setProperty(
            "display",
            "none",
            "important"
        );


        const root =
            document.createElement(
                "div"
            );

        root.className =
            "fd163-dropdown";


        const trigger =
            document.createElement(
                "button"
            );

        trigger.type =
            "button";

        trigger.className =
            "fd163-dropdown-trigger";

        trigger.setAttribute(
            "aria-haspopup",
            "listbox"
        );

        trigger.setAttribute(
            "aria-expanded",
            "false"
        );


        const label =
            document.createElement(
                "span"
            );

        label.className =
            "fd163-dropdown-label";


        const chevron =
            document.createElement(
                "span"
            );

        chevron.className =
            "fd163-dropdown-chevron";

        chevron.setAttribute(
            "aria-hidden",
            "true"
        );


        trigger.append(
            label,
            chevron
        );

        root.appendChild(
            trigger
        );

        select.insertAdjacentElement(
            "afterend",
            root
        );


        const menu =
            document.createElement(
                "div"
            );

        menu.className =
            "fd163-dropdown-menu";

        menu.setAttribute(
            "role",
            "listbox"
        );

        menu.hidden =
            true;

        document.body.appendChild(
            menu
        );


        function refs() {
            return compositeReferences();
        }


        function applyReferenceStyle() {
            const reference =
                refs();

            copyComputed(
                reference.trigger,
                trigger,
                TRIGGER_PROPS
            );

            copyComputed(
                reference.menu,
                menu,
                MENU_PROPS
            );

            trigger.style.setProperty(
                "width",
                "100%",
                "important"
            );

            trigger.style.setProperty(
                "min-width",
                "0",
                "important"
            );

            menu.style.setProperty(
                "position",
                "fixed",
                "important"
            );

            menu.style.setProperty(
                "z-index",
                "2147483000",
                "important"
            );
        }


        function selectedOption() {
            return (
                select.options[
                    select.selectedIndex
                ]
                ||
                null
            );
        }


        function positionMenu() {
            if (
                menu.hidden
            ) {
                return;
            }

            const rect =
                trigger
                    .getBoundingClientRect();

            menu.style.left =
                `${Math.round(
                    rect.left
                )}px`;

            menu.style.top =
                `${Math.round(
                    rect.bottom
                    +
                    5
                )}px`;

            menu.style.width =
                `${Math.round(
                    rect.width
                )}px`;
        }


        function close() {
            if (
                menu.hidden
            ) {
                return;
            }

            menu.hidden =
                true;

            root.classList.remove(
                "open"
            );

            trigger.setAttribute(
                "aria-expanded",
                "false"
            );
        }


        function sync() {
            label.textContent =
                presentedLabel(
                    select,
                    selectedOption(),
                    fallback
                );

            trigger.disabled =
                !!select.disabled;

            menu
                .querySelectorAll(
                    ".fd163-dropdown-option"
                )
                .forEach(
                    button => {
                        const active =
                            button
                                .dataset
                                .value
                            ===
                            select.value;

                        button.classList.toggle(
                            "selected",
                            active
                        );

                        button.setAttribute(
                            "aria-selected",
                            active
                            ?
                            "true"
                            :
                            "false"
                        );
                    }
                );
        }


        function rebuild() {
            menu.replaceChildren();

            const reference =
                refs();

            for (
                const option
                of [
                    ...select.options
                ]
            ) {
                if (
                    !optionVisible(
                        select,
                        option
                    )
                ) {
                    continue;
                }

                const button =
                    document.createElement(
                        "button"
                    );

                button.type =
                    "button";

                button.className =
                    "fd163-dropdown-option";

                button.dataset.value =
                    option.value;

                button.textContent =
                    String(
                        option.textContent
                        ||
                        ""
                    )
                    .replace(
                        /\s*\(v3\)\s*/gi,
                        ""
                    )
                    .trim();

                const active =
                    option.value
                    ===
                    select.value;

                if (active) {
                    button.classList.add(
                        "selected"
                    );
                }

                copyComputed(
                    reference.option,
                    button,
                    OPTION_PROPS
                );

                if (
                    active
                    &&
                    reference.selected
                ) {
                    copyComputed(
                        reference.selected,
                        button,
                        OPTION_PROPS
                    );
                }

                button.style.setProperty(
                    "width",
                    "100%",
                    "important"
                );

                button.style.setProperty(
                    "text-align",
                    "left",
                    "important"
                );

                button.addEventListener(
                    "click",
                    () => {
                        if (
                            select.value
                            !==
                            option.value
                        ) {
                            select.value =
                                option.value;

                            select.dispatchEvent(
                                new Event(
                                    "change",
                                    {
                                        bubbles:
                                            true
                                    }
                                )
                            );
                        }

                        sync();
                        close();
                        trigger.focus();
                    }
                );

                menu.appendChild(
                    button
                );
            }
        }


        function open() {
            if (
                trigger.disabled
            ) {
                return;
            }

            applyReferenceStyle();
            rebuild();
            sync();

            menu.hidden =
                false;

            root.classList.add(
                "open"
            );

            trigger.setAttribute(
                "aria-expanded",
                "true"
            );

            positionMenu();
        }


        trigger.addEventListener(
            "click",
            event => {
                event.preventDefault();

                if (
                    menu.hidden
                ) {
                    open();
                }
                else {
                    close();
                }
            }
        );


        document.addEventListener(
            "pointerdown",
            event => {
                if (
                    !root.contains(
                        event.target
                    )
                    &&
                    !menu.contains(
                        event.target
                    )
                ) {
                    close();
                }
            }
        );


        window.addEventListener(
            "resize",
            positionMenu
        );


        window.addEventListener(
            "scroll",
            positionMenu,
            true
        );


        select.addEventListener(
            "change",
            sync
        );


        dropdowns.set(
            select,
            {
                root,
                trigger,
                menu,
                sync,
                close,
            }
        );


        applyReferenceStyle();
        sync();
    }


    function setupAllDropdowns() {
        retireOldDropdownPresentation();

        enhanceSelect(
            $("partial-sessions"),
            "No saved sessions"
        );

        enhanceSelect(
            $("maps"),
            "Select map"
        );

        enhanceSelect(
            $("car-pick-mode"),
            "G1 destination"
        );

        enhanceSelect(
            $("car-maps"),
            "Select map"
        );
    }


    /* ========================================================
       6. RETIRED CAR FEATURE / COPY
       ======================================================== */

    function hideCarResultCopy() {
        const result =
            $("car-result");

        if (result) {
            result.style.setProperty(
                "display",
                "none",
                "important"
            );
        }

        for (
            const node
            of document.querySelectorAll(
                ".car-side p,"
                +
                ".car-side .help,"
                +
                ".car-side small,"
                +
                ".car-side .readiness"
            )
        ) {
            const text =
                norm(node);

            if (
                text.includes(
                    "car commands do not control g1"
                )
                ||
                text.includes(
                    "comenzile mașinuței nu comandă g1"
                )
            ) {
                node.style.setProperty(
                    "display",
                    "none",
                    "important"
                );
            }
        }
    }


    function retireIcpControl() {
        const old =
            $("car-refine-icp");

        if (
            !old
            ||
            old.dataset
                .fd163Retired
            ===
            "1"
        ) {
            return;
        }

        /*
         * Preserve an inert hidden node with the same id so any
         * later status-writing code can still find it, but detach
         * every event listener bound to the original button.
         */
        const inert =
            old.cloneNode(
                true
            );

        inert.dataset.fd163Retired =
            "1";

        inert.disabled =
            true;

        inert.hidden =
            true;

        inert.style.setProperty(
            "display",
            "none",
            "important"
        );

        inert.addEventListener(
            "click",
            event => {
                event.preventDefault();
                event.stopImmediatePropagation();
            },
            true
        );

        old.replaceWith(
            inert
        );
    }


    /* ========================================================
       7. EXACT LIVE-LANGUAGE MAJOR DRAG ENGINE
       ======================================================== */

    const majorNodes =
        new Map();

    let majorShell =
        null;

    let drag =
        null;


    function discoverMajors() {
        majorShell =
            document.querySelector(
                ".app-shell"
            );

        if (!majorShell) {
            return false;
        }

        const robot =
            majorShell.querySelector(
                ":scope > "
                +
                ".control-panel"
                +
                ":not(.car-side)"
            );

        const map =
            majorShell.querySelector(
                ":scope > "
                +
                ".workspace"
            );

        const car =
            majorShell.querySelector(
                ":scope > "
                +
                ".control-panel"
                +
                ".car-side"
            );

        if (
            !robot
            ||
            !map
            ||
            !car
        ) {
            return false;
        }

        majorNodes.clear();

        majorNodes.set(
            "robot",
            robot
        );

        majorNodes.set(
            "map",
            map
        );

        majorNodes.set(
            "car",
            car
        );

        return true;
    }


    function orderedMajors() {
        if (!majorShell) {
            return [];
        }

        return [
            ...majorShell.children
        ]
        .filter(
            node =>
                [
                    ...majorNodes.values()
                ].includes(
                    node
                )
        );
    }


    function captureMajorRects(
        exclude = null
    ) {
        const result =
            new Map();

        for (
            const node
            of orderedMajors()
        ) {
            if (
                node
                ===
                exclude
            ) {
                continue;
            }

            result.set(
                node,
                node
                    .getBoundingClientRect()
            );
        }

        return result;
    }


    function cancelMajorAnimations(
        exclude = null
    ) {
        for (
            const node
            of orderedMajors()
        ) {
            if (
                node
                ===
                exclude
            ) {
                continue;
            }

            for (
                const animation
                of node.getAnimations()
            ) {
                animation.cancel();
            }
        }
    }


    function animateMajorFlip(
        before,
        exclude = null
    ) {
        for (
            const node
            of orderedMajors()
        ) {
            if (
                node
                ===
                exclude
            ) {
                continue;
            }

            const oldRect =
                before.get(
                    node
                );

            const newRect =
                node
                    .getBoundingClientRect();

            if (
                !oldRect
                ||
                !newRect
            ) {
                continue;
            }

            const dx =
                oldRect.left
                -
                newRect.left;

            if (
                Math.abs(dx)
                <
                1
            ) {
                continue;
            }

            node.animate(
                [
                    {
                        transform:
                            `translate3d(${dx}px,0,0)`
                    },
                    {
                        transform:
                            "translate3d(0,0,0)"
                    },
                ],
                {
                    duration:
                        320,

                    easing:
                        "cubic-bezier(.2,.85,.25,1)",
                }
            );
        }
    }


    function saveMajorOrder() {
        try {
            localStorage.setItem(
                "fullDashSlamMajorOrderV16",
                JSON.stringify(
                    orderedMajors()
                        .map(
                            node =>
                                node.dataset
                                    .fd163MajorKey
                        )
                )
            );
        }
        catch (_) {}
    }


    function restoreMajorOrder() {
        try {
            const raw =
                localStorage.getItem(
                    "fullDashSlamMajorOrderV16"
                );

            if (!raw) return;

            const order =
                JSON.parse(
                    raw
                );

            if (
                !Array.isArray(
                    order
                )
                ||
                order.length
                !==
                3
                ||
                ![
                    "robot",
                    "map",
                    "car",
                ].every(
                    key =>
                        order.includes(
                            key
                        )
                )
            ) {
                return;
            }

            for (
                const key
                of order
            ) {
                majorShell.appendChild(
                    majorNodes.get(
                        key
                    )
                );
            }
        }
        catch (_) {}
    }


    function maybeReorderMajor(
        clientX
    ) {
        if (!drag) return;

        const order =
            orderedMajors();

        const index =
            order.indexOf(
                drag.node
            );

        if (
            index
            <
            0
        ) {
            return;
        }

        let nextIndex =
            index;

        if (
            index
            >
            0
        ) {
            const prev =
                order[
                    index - 1
                ]
                .getBoundingClientRect();

            if (
                clientX
                <
                prev.left
                +
                prev.width / 2
            ) {
                nextIndex =
                    index - 1;
            }
        }

        if (
            nextIndex
            ===
            index
            &&
            index
            <
            order.length - 1
        ) {
            const next =
                order[
                    index + 1
                ]
                .getBoundingClientRect();

            if (
                clientX
                >
                next.left
                +
                next.width / 2
            ) {
                nextIndex =
                    index + 1;
            }
        }

        if (
            nextIndex
            ===
            index
        ) {
            return;
        }

        const before =
            captureMajorRects(
                drag.node
            );

        cancelMajorAnimations(
            drag.node
        );

        const oldDx =
            drag.dx;

        const visualLeft =
            drag.node
                .getBoundingClientRect()
                .left;

        if (
            nextIndex
            <
            index
        ) {
            majorShell.insertBefore(
                drag.node,
                order[nextIndex]
            );
        }
        else {
            const target =
                order[nextIndex];

            majorShell.insertBefore(
                drag.node,
                target.nextSibling
            );
        }

        const visualWithOldTransform =
            drag.node
                .getBoundingClientRect()
                .left;

        drag.baseLeft =
            visualWithOldTransform
            -
            oldDx;

        const desiredLeft =
            clientX
            -
            drag.grabX;

        drag.dx =
            desiredLeft
            -
            drag.baseLeft;

        drag.node.style.setProperty(
            "transform",
            `translate3d(${drag.dx}px,0,0)`,
            "important"
        );

        animateMajorFlip(
            before,
            drag.node
        );

        saveMajorOrder();
    }


    function moveMajorDrag(
        event
    ) {
        if (
            !drag
            ||
            event.pointerId
            !==
            drag.pointerId
        ) {
            return;
        }

        const desiredLeft =
            event.clientX
            -
            drag.grabX;

        drag.dx =
            desiredLeft
            -
            drag.baseLeft;

        drag.node.style.setProperty(
            "transform",
            `translate3d(${drag.dx}px,0,0)`,
            "important"
        );

        maybeReorderMajor(
            event.clientX
        );
    }


    function finishMajorDrag(
        event
    ) {
        if (
            !drag
            ||
            event.pointerId
            !==
            drag.pointerId
        ) {
            return;
        }

        const state =
            drag;

        const before =
            captureMajorRects();

        drag =
            null;

        state.handle.classList.remove(
            "fd163-active"
        );

        document.body.classList.remove(
            "fd163-major-dragging"
        );

        state.node.style.removeProperty(
            "transform"
        );

        state.node.classList.remove(
            "fd163-major-following"
        );

        animateMajorFlip(
            before
        );

        try {
            state.handle
                .releasePointerCapture(
                    state.pointerId
                );
        }
        catch (_) {}

        saveMajorOrder();
    }


    function beginMajorDrag(
        event,
        node,
        handle
    ) {
        if (
            event.button
            !==
            0
        ) {
            return;
        }

        event.preventDefault();

        cancelMajorAnimations();

        const rect =
            node
                .getBoundingClientRect();

        drag = {
            node,
            handle,

            pointerId:
                event.pointerId,

            grabX:
                event.clientX
                -
                rect.left,

            baseLeft:
                rect.left,

            dx:
                0,
        };

        handle.classList.add(
            "fd163-active"
        );

        node.classList.add(
            "fd163-major-following"
        );

        document.body.classList.add(
            "fd163-major-dragging"
        );

        handle.setPointerCapture(
            event.pointerId
        );
    }


    function installMajorHandles() {
        if (
            !discoverMajors()
        ) {
            return;
        }

        document
            .querySelectorAll(
                ".fd-slam-major-handle-v5,"
                +
                ".fd-slam-major-handle-v8,"
                +
                ".fd151-live-handle,"
                +
                ".fd16-major-handle,"
                +
                ".fd163-major-handle"
            )
            .forEach(
                node =>
                    node.remove()
            );


        for (
            const [
                key,
                node
            ]
            of majorNodes
        ) {
            node.dataset
                .fd163MajorKey =
                    key;

            const handle =
                document.createElement(
                    "button"
                );

            handle.type =
                "button";

            handle.className =
                "fd163-major-handle";

            handle.setAttribute(
                "aria-label",
                `Move ${key} section`
            );


            const grip =
                document.createElement(
                    "span"
                );

            grip.className =
                "fd163-major-grip";

            handle.appendChild(
                grip
            );

            node.prepend(
                handle
            );


            handle.addEventListener(
                "pointerdown",
                event =>
                    beginMajorDrag(
                        event,
                        node,
                        handle
                    )
            );

            handle.addEventListener(
                "pointermove",
                moveMajorDrag
            );

            handle.addEventListener(
                "pointerup",
                finishMajorDrag
            );

            handle.addEventListener(
                "pointercancel",
                finishMajorDrag
            );
        }

        restoreMajorOrder();
    }


    /* ========================================================
       BOOT
       ======================================================== */

    function boot() {
        syncMappingPauseIcon();
        syncXrTypography();
        syncBottomTelemetry();
        setupAllDropdowns();
        hideCarResultCopy();
        installMajorHandles();
    }


    if (
        document.readyState
        ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            boot,
            {
                once: true
            }
        );
    }
    else {
        boot();
    }


    window.addEventListener(
        "load",
        () => {
            boot();

            /*
             * Let car.js finish binding first, then replace its
             * ICP button with an inert clone that has no old listener.
             */
            setTimeout(
                retireIcpControl,
                500
            );
        },
        {
            once: true
        }
    );


    window.addEventListener(
        "resize",
        () => {
            syncXrTypography();
            syncBottomTelemetry();
        }
    );


    /*
     * Finite cleanup only. Older SLAM layers also use finite
     * DOM-ready passes. These two passes make V16.3 the last owner.
     */
    setTimeout(
        () => {
            boot();
        },
        650
    );


    setTimeout(
        () => {
            boot();
            retireIcpControl();
        },
        1400
    );

})();

/* ===== END full_dashboard_parity_v16.js ===== */

/* ===== BEGIN full_dashboard_parity_v164.js ===== */
/* ============================================================
   FULL_DASH_SLAM_PARITY_JS_V164
   ============================================================ */

(() => {
    "use strict";

    if (window.__FULL_DASH_SLAM_V164__) return;
    window.__FULL_DASH_SLAM_V164__ = true;

    const $ = id => document.getElementById(id);
    const norm = value => String(
        value?.textContent ?? value ?? ""
    ).replace(/\s+/g, " ").trim().toLowerCase();

    function parentDocument() {
        try {
            if (window.parent && window.parent !== window && window.parent.document) {
                return window.parent.document;
            }
        } catch (_) {}
        return null;
    }

    function cssName(property) {
        return property.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
    }

    function copyComputed(source, target, properties) {
        if (!source || !target) return;
        const view = source.ownerDocument.defaultView;
        const style = view.getComputedStyle(source);
        for (const property of properties) {
            const value = style[property];
            if (value !== undefined && value !== null && value !== "") {
                target.style.setProperty(cssName(property), value, "important");
            }
        }
    }

    /* ------------------------------------------------------------
       1. REMOVE V3 COPY FROM THE AUTHORITATIVE NATIVE OPTION
       ------------------------------------------------------------ */

    function cleanV3Text() {
        const select = $("car-pick-mode");
        if (select) {
            for (const option of select.options) {
                option.textContent = String(option.textContent || "")
                    .replace(/\s*\(v3\)\s*/gi, "")
                    .trim();
            }
        }

        for (const node of document.querySelectorAll("button, div, span")) {
            if (norm(node).includes("g1 destination (v3)")) {
                node.textContent = String(node.textContent || "")
                    .replace(/\s*\(v3\)\s*/gi, "")
                    .trim();
            }
        }
    }

    /* ------------------------------------------------------------
       2. ONE DROPDOWN OWNER ONLY
       ------------------------------------------------------------ */

    const dropdowns = new Map();

    const TRIGGER_PROPS = [
        "height", "minHeight", "maxHeight",
        "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
        "background", "backgroundColor", "backgroundImage",
        "borderTopWidth", "borderTopStyle", "borderTopColor",
        "borderRightWidth", "borderRightStyle", "borderRightColor",
        "borderBottomWidth", "borderBottomStyle", "borderBottomColor",
        "borderLeftWidth", "borderLeftStyle", "borderLeftColor",
        "borderRadius", "boxShadow",
        "fontFamily", "fontSize", "fontWeight", "lineHeight",
        "letterSpacing", "textTransform", "color"
    ];

    const MENU_PROPS = [
        "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
        "background", "backgroundColor", "backgroundImage",
        "borderTopWidth", "borderTopStyle", "borderTopColor",
        "borderRightWidth", "borderRightStyle", "borderRightColor",
        "borderBottomWidth", "borderBottomStyle", "borderBottomColor",
        "borderLeftWidth", "borderLeftStyle", "borderLeftColor",
        "borderRadius", "boxShadow"
    ];

    const OPTION_PROPS = [
        "height", "minHeight",
        "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
        "marginTop", "marginRight", "marginBottom", "marginLeft",
        "background", "backgroundColor", "backgroundImage",
        "borderTopWidth", "borderTopStyle", "borderTopColor",
        "borderRightWidth", "borderRightStyle", "borderRightColor",
        "borderBottomWidth", "borderBottomStyle", "borderBottomColor",
        "borderLeftWidth", "borderLeftStyle", "borderLeftColor",
        "borderRadius", "boxShadow",
        "fontFamily", "fontSize", "fontWeight", "lineHeight",
        "letterSpacing", "textTransform", "color"
    ];

    function compositeReferences() {
        const pd = parentDocument();
        return {
            trigger: pd?.querySelector(
                "#stitchHealthDropdownV174 .stitch-health-trigger-v174"
            ) || null,
            menu: pd?.querySelector(
                "body > .stitch-health-menu-v174"
            ) || null,
            option: pd?.querySelector(
                "body > .stitch-health-menu-v174 .stitch-health-option-v174:not(.selected)"
            ) || null,
            selected: pd?.querySelector(
                "body > .stitch-health-menu-v174 .stitch-health-option-v174.selected"
            ) || null,
        };
    }

    function removeHistoricalDropdowns() {
        document.querySelectorAll([
            ".fd-partial-dropdown-v6",
            ".fd-map-dropdown-v7",
            ".fd162-dropdown",
            ".fd163-dropdown",
            ".fd164-dropdown",
            "body > .fd-partial-menu-v6",
            "body > .fd-map-menu-v7",
            "body > .fd162-dropdown-menu",
            "body > .fd163-dropdown-menu",
            "body > .fd164-dropdown-menu"
        ].join(",")).forEach(node => node.remove());
    }

    function keepOnlySelectAndRefresh(select, refreshId) {
        if (!select?.parentElement) return;
        const parent = select.parentElement;
        const refresh = refreshId ? $(refreshId) : null;

        for (const child of [...parent.children]) {
            if (child === select || child === refresh) continue;

            const cls = String(child.className || "");
            const text = norm(child);

            if (
                /dropdown|select-trigger|select-menu|chevron/i.test(cls)
                || text.includes("g1 destination (v3)")
                || (
                    child.tagName === "BUTTON"
                    && !child.id
                    && (text === "" || text === "⌄" || text === "⌃")
                )
            ) {
                child.remove();
            }
        }

        if (refresh) {
            parent.classList.add("fd164-select-row");
        }
    }

    function optionLabel(select, option, fallback) {
        const raw = String(option?.textContent || "")
            .replace(/\s*\(v3\)\s*/gi, "")
            .trim();
        return raw || fallback;
    }

    function enhanceSelect(select, fallback, refreshId = null) {
        if (!select || dropdowns.has(select)) return;

        keepOnlySelectAndRefresh(select, refreshId);

        const root = document.createElement("div");
        root.className = "fd164-dropdown";

        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "fd164-dropdown-trigger";
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");

        const label = document.createElement("span");
        label.className = "fd164-dropdown-label";

        const chevron = document.createElement("span");
        chevron.className = "fd164-dropdown-chevron";
        chevron.setAttribute("aria-hidden", "true");

        trigger.append(label, chevron);
        root.appendChild(trigger);

        select.insertAdjacentElement("afterend", root);

        const menu = document.createElement("div");
        menu.className = "fd164-dropdown-menu";
        menu.hidden = true;
        menu.setAttribute("role", "listbox");
        document.body.appendChild(menu);

        function refs() {
            return compositeReferences();
        }

        function applyReferenceStyle() {
            const ref = refs();
            copyComputed(ref.trigger, trigger, TRIGGER_PROPS);
            copyComputed(ref.menu, menu, MENU_PROPS);

            trigger.style.setProperty("width", "100%", "important");
            trigger.style.setProperty("min-width", "0", "important");
            trigger.style.setProperty("position", "relative", "important");
            trigger.style.setProperty("text-align", "left", "important");
        }

        function selectedOption() {
            return select.options[select.selectedIndex] || null;
        }

        function sync() {
            label.textContent = optionLabel(select, selectedOption(), fallback);
            trigger.disabled = !!select.disabled;

            menu.querySelectorAll(".fd164-dropdown-option").forEach(button => {
                const active = button.dataset.value === select.value;
                button.classList.toggle("selected", active);
                button.setAttribute("aria-selected", active ? "true" : "false");
            });
        }

        function positionMenu() {
            if (menu.hidden) return;
            const rect = trigger.getBoundingClientRect();
            menu.style.left = `${Math.round(rect.left)}px`;
            menu.style.top = `${Math.round(rect.bottom + 5)}px`;
            menu.style.width = `${Math.round(rect.width)}px`;
        }

        function close() {
            if (menu.hidden) return;
            menu.hidden = true;
            root.classList.remove("open");
            trigger.setAttribute("aria-expanded", "false");
        }

        function rebuild() {
            menu.replaceChildren();
            const ref = refs();

            for (const option of [...select.options]) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "fd164-dropdown-option";
                button.dataset.value = option.value;
                button.textContent = optionLabel(select, option, fallback);

                const active = option.value === select.value;
                if (active) button.classList.add("selected");

                copyComputed(ref.option, button, OPTION_PROPS);
                if (active && ref.selected) {
                    copyComputed(ref.selected, button, OPTION_PROPS);
                }

                button.style.setProperty("width", "100%", "important");
                button.style.setProperty("text-align", "left", "important");

                button.addEventListener("click", () => {
                    if (select.value !== option.value) {
                        select.value = option.value;
                        select.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                    sync();
                    close();
                    trigger.focus();
                });

                menu.appendChild(button);
            }
        }

        function open() {
            if (trigger.disabled) return;
            applyReferenceStyle();
            rebuild();
            sync();
            menu.hidden = false;
            root.classList.add("open");
            trigger.setAttribute("aria-expanded", "true");
            positionMenu();
        }

        trigger.addEventListener("click", event => {
            event.preventDefault();
            menu.hidden ? open() : close();
        });

        document.addEventListener("pointerdown", event => {
            if (!root.contains(event.target) && !menu.contains(event.target)) close();
        });

        window.addEventListener("resize", positionMenu);
        window.addEventListener("scroll", positionMenu, true);
        select.addEventListener("change", sync);

        dropdowns.set(select, { root, trigger, menu, sync, close });
        applyReferenceStyle();
        sync();
    }

    function installDropdowns() {
        removeHistoricalDropdowns();
        dropdowns.clear();

        enhanceSelect($("partial-sessions"), "No saved sessions", "refresh-partials");
        enhanceSelect($("maps"), "Select map", "refresh-maps");
        enhanceSelect($("car-pick-mode"), "G1 destination");
        enhanceSelect($("car-maps"), "Select map", "car-refresh-maps");
    }

    /* ------------------------------------------------------------
       3. MAPPING PAUSE ICON — copy Navigation Pause exactly
       ------------------------------------------------------------ */

    function syncMappingPauseIcon() {
        const source = $("pause");
        const root = $("fd15MappingControls");
        const target = root?.querySelectorAll(".fd15-live-switch")[1]
            ?.querySelector(".fd15-left");

        if (!source || !target) return;
        if (!norm(target).includes("pause")) return;

        target.innerHTML = source.innerHTML;

        if (!norm(target).includes("pause")) {
            target.textContent = "Ⅱ Pause";
        }
    }


    /* ------------------------------------------------------------
       5. ONE GRAY BUTTON FAMILY
       ------------------------------------------------------------ */

    function styleGrayActions() {
        for (const id of [
            "car-mapping",
            "car-localization",
            "car-tf-flip",
            "car-standalone",
            "car-center",
            "car-transform"
        ]) {
            $(id)?.classList.add("fd164-gray-action");
        }
    }

    /* ------------------------------------------------------------
       6. EXACT LIVE-LANGUAGE THREE-SURFACE DRAG
       ------------------------------------------------------------ */

    let shell = null;
    let order = ["robot", "map", "car"];
    let drag = null;
    const majors = new Map();

    function discoverMajors() {
        shell = document.querySelector(".app-shell");
        if (!shell) return false;

        const robot = shell.querySelector(":scope > .control-panel:not(.car-side)");
        const map = shell.querySelector(":scope > .workspace");
        const car = shell.querySelector(":scope > .control-panel.car-side");
        if (!robot || !map || !car) return false;

        majors.clear();
        majors.set("robot", robot);
        majors.set("map", map);
        majors.set("car", car);

        for (const [key, node] of majors) {
            node.dataset.fd164MajorKey = key;
        }
        return true;
    }

    function applyOrderBare(next) {
        if (!shell) return;
        for (const key of next) shell.appendChild(majors.get(key));
        order = [...next];
    }

    function saveOrder() {
        try {
            localStorage.setItem("fullDashSlamMajorOrderV164", JSON.stringify(order));
        } catch (_) {}
    }

    function restoreOrder() {
        try {
            const raw = localStorage.getItem("fullDashSlamMajorOrderV164");
            if (!raw) return;
            const next = JSON.parse(raw);
            if (
                Array.isArray(next)
                && next.length === 3
                && ["robot", "map", "car"].every(key => next.includes(key))
            ) {
                applyOrderBare(next);
            }
        } catch (_) {}
    }

    function captureRects(exclude = null) {
        const result = new Map();
        for (const node of majors.values()) {
            if (node === exclude) continue;
            result.set(node, node.getBoundingClientRect());
        }
        return result;
    }

    function cancelAnimations(exclude = null) {
        for (const node of majors.values()) {
            if (node === exclude) continue;
            for (const animation of node.getAnimations()) animation.cancel();
        }
    }

    function animateFrom(before, exclude = null) {
        for (const node of majors.values()) {
            if (node === exclude) continue;
            const oldRect = before.get(node);
            const newRect = node.getBoundingClientRect();
            if (!oldRect || !newRect) continue;

            const dx = oldRect.left - newRect.left;
            if (Math.abs(dx) < 1) continue;

            node.animate(
                [
                    { transform: `translate3d(${dx}px,0,0)` },
                    { transform: "translate3d(0,0,0)" }
                ],
                {
                    duration: 320,
                    easing: "cubic-bezier(.2,.85,.25,1)"
                }
            );
        }
    }

    function sameOrder(a, b) {
        return a.length === b.length && a.every((value, index) => value === b[index]);
    }

    function targetIndex(clientX) {
        const rect = shell.getBoundingClientRect();
        const ratio = Math.max(
            0,
            Math.min(.999999, (clientX - rect.left) / Math.max(1, rect.width))
        );
        if (ratio < 1 / 3) return 0;
        if (ratio < 2 / 3) return 1;
        return 2;
    }

    function candidateOrder(key, index, startOrder) {
        const result = startOrder.filter(item => item !== key);
        result.splice(index, 0, key);
        return result;
    }

    function moveDrag(event) {
        if (!drag || event.pointerId !== drag.pointerId) return;
        event.preventDefault();

        const desiredLeft = event.clientX - drag.grabOffset;
        drag.dx = desiredLeft - drag.baseLeft;
        drag.rail.style.setProperty("--fd164-major-drag-x", `${drag.dx}px`);

        const candidate = candidateOrder(
            drag.key,
            targetIndex(event.clientX),
            drag.startOrder
        );

        if (sameOrder(candidate, drag.currentOrder)) return;

        const before = captureRects(drag.rail);
        cancelAnimations(drag.rail);
        const oldDx = drag.dx;

        applyOrderBare(candidate);

        const visualWithOldTransform = drag.rail.getBoundingClientRect().left;
        drag.baseLeft = visualWithOldTransform - oldDx;
        drag.dx = desiredLeft - drag.baseLeft;
        drag.rail.style.setProperty("--fd164-major-drag-x", `${drag.dx}px`);

        animateFrom(before, drag.rail);
        drag.currentOrder = [...candidate];
        drag.targetOrder = [...candidate];
    }

    function cleanupDrag() {
        if (!drag) return;
        drag.rail.classList.remove("fd164-major-following");
        drag.handle.classList.remove("fd164-major-handle-active");
        drag.rail.style.removeProperty("--fd164-major-drag-x");
        document.body.classList.remove("fd164-major-dragging");
        document.removeEventListener("pointermove", moveDrag, true);
        document.removeEventListener("pointerup", finishDrag, true);
        document.removeEventListener("pointercancel", cancelDrag, true);
    }

    function finish(event, cancelled) {
        if (!drag || event.pointerId !== drag.pointerId) return;
        event.preventDefault();
        event.stopImmediatePropagation();

        const before = captureRects();
        cancelAnimations();
        const finalOrder = cancelled ? drag.startOrder : drag.targetOrder;
        const handle = drag.handle;

        try { handle.releasePointerCapture(event.pointerId); } catch (_) {}

        drag.rail.classList.remove("fd164-major-following");
        drag.rail.style.removeProperty("--fd164-major-drag-x");
        applyOrderBare(finalOrder);
        animateFrom(before);

        if (!cancelled) {
            order = [...finalOrder];
            saveOrder();
        }

        cleanupDrag();
        drag = null;
    }

    function finishDrag(event) { finish(event, false); }
    function cancelDrag(event) { finish(event, true); }

    function beginDrag(event, key, handle, rail) {
        if (event.button !== 0 || drag) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelAnimations();

        const rect = rail.getBoundingClientRect();
        drag = {
            pointerId: event.pointerId,
            key,
            handle,
            rail,
            grabOffset: event.clientX - rect.left,
            baseLeft: rect.left,
            dx: 0,
            startOrder: [...order],
            currentOrder: [...order],
            targetOrder: [...order]
        };

        rail.classList.add("fd164-major-following");
        handle.classList.add("fd164-major-handle-active");
        document.body.classList.add("fd164-major-dragging");

        try { handle.setPointerCapture(event.pointerId); } catch (_) {}

        document.addEventListener("pointermove", moveDrag, true);
        document.addEventListener("pointerup", finishDrag, true);
        document.addEventListener("pointercancel", cancelDrag, true);
    }

    function makeHandle(section, key) {
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "fd164-major-handle";
        handle.setAttribute("aria-label", `Move ${key} section`);
        handle.title = `Drag ${key} section`;

        const grip = document.createElement("span");
        grip.className = "fd164-major-grip";
        grip.setAttribute("aria-hidden", "true");
        handle.appendChild(grip);

        handle.addEventListener(
            "pointerdown",
            event => beginDrag(event, key, handle, section),
            true
        );

        section.prepend(handle);
    }

    function installMajorHandles() {
        if (!discoverMajors()) return;

        document.querySelectorAll([
            ".fd-slam-major-handle-v5",
            ".fd-slam-major-handle-v8",
            ".fd151-live-handle",
            ".fd16-major-handle",
            ".fd163-major-handle",
            ".fd164-major-handle"
        ].join(",")).forEach(node => node.remove());

        for (const [key, node] of majors) makeHandle(node, key);
        restoreOrder();
    }

    /* ------------------------------------------------------------
       BOOT — finite passes only; no interval, no broad observer.
       ------------------------------------------------------------ */

    function boot() {
        cleanV3Text();
        installDropdowns();
        syncMappingPauseIcon();
        styleGrayActions();
        installMajorHandles();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }

    window.addEventListener("load", () => boot(), { once: true });

    for (const delay of [350, 950, 1800, 3000]) {
        setTimeout(boot, delay);
    }
})();

/* ===== END full_dashboard_parity_v164.js ===== */

/* ===== BEGIN full_dashboard_parity_v165.js ===== */
(() => {
    "use strict";

    /* FULL_DASH_SLAM_PARITY_JS_V165 */

    const $ = id => document.getElementById(id);

    const norm = value =>
        String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    function normalizeSelectOwners() {
        const carPick = $("car-pick-mode");

        if (carPick) {
            for (const option of carPick.options) {
                if (norm(option.textContent) === "g1 destination (v3)") {
                    option.textContent = "G1 destination";
                }
            }
        }

        for (const id of ["partial-sessions", "maps", "car-maps", "car-pick-mode"]) {
            const select = $(id);
            if (!select) continue;

            const row = select.closest(".select-row") || select.parentElement;
            if (!row) continue;

            const refreshIds = new Set([
                "refresh-partials",
                "refresh-maps",
                "car-refresh-maps",
            ]);

            const clickable = [...row.querySelectorAll("button,[role='button'],[tabindex]")]
                .filter(node => {
                    if (node === select || refreshIds.has(node.id)) return false;
                    const rect = node.getBoundingClientRect();
                    const style = getComputedStyle(node);
                    return (
                        rect.width > 0 &&
                        rect.height > 0 &&
                        style.display !== "none" &&
                        style.visibility !== "hidden"
                    );
                });

            if (clickable.length < 2) continue;

            const ranked = clickable
                .map(node => ({
                    node,
                    width: node.getBoundingClientRect().width,
                    text: norm(node.textContent),
                }))
                .sort((a, b) => b.width - a.width);

            const keep = ranked[0]?.node;

            for (const entry of ranked) {
                if (entry.node === keep) continue;

                if (
                    entry.width < 82 ||
                    !entry.text ||
                    /^[⌄⌃∨∧▼▲v^]+$/.test(entry.text)
                ) {
                    const wrapper = entry.node.closest(
                        ".fd163-dropdown,.fd164-dropdown,.fd16-dropdown,[class*='dropdown']"
                    );

                    if (wrapper && wrapper !== keep && !wrapper.contains(keep)) {
                        wrapper.remove();
                    } else {
                        entry.node.remove();
                    }
                }
            }
        }

        const carPanel = $("car-panel");
        if (carPanel) {
            const duplicates = [...carPanel.querySelectorAll("button,[role='button']")]
                .filter(node => {
                    const text = norm(node.textContent);
                    if (text !== "g1 destination" && text !== "g1 destination (v3)") {
                        return false;
                    }
                    const rect = node.getBoundingClientRect();
                    const style = getComputedStyle(node);
                    return (
                        rect.width > 120 &&
                        rect.height > 18 &&
                        style.display !== "none" &&
                        style.visibility !== "hidden"
                    );
                });

            duplicates.slice(1).forEach(node => {
                const wrapper = node.closest(
                    ".fd163-dropdown,.fd164-dropdown,.fd16-dropdown,[class*='dropdown']"
                );
                if (wrapper && wrapper !== node) {
                    wrapper.remove();
                } else {
                    node.remove();
                }
            });
        }
    }


    function moveCarLayerToggles() {
        const map = $("car-show-map");
        const scan = $("car-show-scan");
        const pose = document.querySelector(".workspace .topbar .pose-bar");

        if (!map || !scan || !pose) return;

        let host = $("fd165CenterCarLayers");

        if (!host) {
            host = document.createElement("span");
            host.id = "fd165CenterCarLayers";
            host.className = "fd165-layer-toggles";
            pose.appendChild(host);
        }

        for (const input of [map, scan]) {
            const label = input.closest("label");
            if (!label) continue;
            label.classList.add("fd165-layer-toggle");
            host.appendChild(label);
        }
    }

    function normalizeZoomButtons() {
        const topbar = document.querySelector(".workspace .topbar");
        if (!topbar) return;

        for (const button of topbar.querySelectorAll("button")) {
            const text = norm(button.textContent);
            if (text === "+" || text === "-" || text === "−") {
                button.classList.add("fd165-zoom-button");
            }
        }
    }

    function normalizeGrayCarActions() {
        const ids = [
            "car-mapping",
            "car-localization",
            "car-tf-flip",
            "car-standalone",
            "car-center",
            "car-transform",
            "car-preview",
            "car-go",
        ];

        for (const id of ids) {
            const button = $(id);
            if (!button) continue;

            button.classList.add("fd165-gray-action");
            button.style.removeProperty("background");
            button.style.removeProperty("color");
            button.style.removeProperty("font-weight");
        }
    }

    const FLIP_MS = 320;
    const FLIP_EASING = "cubic-bezier(.2,.85,.25,1)";
    const STORAGE_KEY = "fullDashSlamMajorOrderV165";

    let shell = null;
    const sections = new Map();
    let drag = null;
    let animations = [];

    function resolveMajor() {
        shell = document.querySelector(".app-shell");
        if (!shell) return false;

        const robot = shell.querySelector(":scope > .control-panel:not(.car-side)");
        const center = shell.querySelector(":scope > .workspace");
        const car = shell.querySelector(":scope > .control-panel.car-side");

        if (!robot || !center || !car) return false;

        sections.clear();
        sections.set("robot", robot);
        sections.set("center", center);
        sections.set("car", car);

        for (const [key, node] of sections) {
            node.dataset.fd165Major = key;
            node.classList.add("fd165-major-surface");
        }

        return true;
    }

    function currentOrder() {
        return [...shell.children]
            .filter(node => node.dataset.fd165Major)
            .map(node => node.dataset.fd165Major);
    }

    function applyOrderBare(next) {
        for (const key of next) {
            const node = sections.get(key);
            if (node) shell.appendChild(node);
        }
        void shell.offsetWidth;
    }

    function captureRects(skip = null) {
        const result = new Map();
        for (const node of sections.values()) {
            if (node === skip) continue;
            result.set(node, node.getBoundingClientRect());
        }
        return result;
    }

    function cancelAnimations() {
        for (const animation of animations) {
            try { animation.cancel(); } catch (_) {}
        }
        animations = [];
    }

    function animateFrom(before, skip = null) {
        for (const [node, oldRect] of before) {
            if (node === skip) continue;

            const newRect = node.getBoundingClientRect();
            const dx = oldRect.left - newRect.left;
            const dy = oldRect.top - newRect.top;

            if (Math.abs(dx) < .5 && Math.abs(dy) < .5) continue;

            const animation = node.animate(
                [
                    {
                        transform:
                            `translate3d(${dx}px, ${dy}px, 0) scale(.985)`
                    },
                    {
                        transform:
                            "translate3d(0, 0, 0) scale(1)"
                    },
                ],
                {
                    duration: FLIP_MS,
                    easing: FLIP_EASING,
                    fill: "both",
                }
            );

            animations.push(animation);
        }
    }

    function targetIndex(clientX) {
        const entries = currentOrder().map(key => {
            const r = sections.get(key).getBoundingClientRect();
            return {
                key,
                center: r.left + r.width / 2,
            };
        });

        let index = 0;

        for (let i = 0; i < entries.length; i += 1) {
            if (clientX > entries[i].center) {
                index = i + 1;
            }
        }

        return Math.max(0, Math.min(entries.length - 1, index));
    }

    function candidateOrder(key, index, base) {
        const result = base.filter(item => item !== key);
        result.splice(index, 0, key);
        return result;
    }

    function sameOrder(a, b) {
        return (
            a.length === b.length &&
            a.every((value, index) => value === b[index])
        );
    }

    function moveDrag(event) {
        if (!drag || event.pointerId !== drag.pointerId) return;

        event.preventDefault();

        const desiredLeft = event.clientX - drag.grabOffset;
        drag.dx = desiredLeft - drag.baseLeft;
        drag.rail.style.transform = `translate3d(${drag.dx}px,0,0)`;

        const next = candidateOrder(
            drag.key,
            targetIndex(event.clientX),
            drag.startOrder
        );

        if (sameOrder(next, drag.currentOrder)) return;

        const before = captureRects(drag.rail);
        const visibleLeft = drag.rail.getBoundingClientRect().left;

        cancelAnimations();
        applyOrderBare(next);

        const after = drag.rail.getBoundingClientRect();
        const untransformedLeft = after.left - drag.dx;

        drag.baseLeft = untransformedLeft;
        drag.dx = visibleLeft - drag.baseLeft;
        drag.rail.style.transform = `translate3d(${drag.dx}px,0,0)`;

        animateFrom(before, drag.rail);

        drag.currentOrder = [...next];
        drag.targetOrder = [...next];
    }

    function cleanupDrag() {
        if (!drag) return;

        drag.rail.classList.remove("fd165-major-following");
        drag.handle.classList.remove("fd165-major-handle-active");
        drag.rail.style.removeProperty("transform");
        drag.rail.style.removeProperty("transition");
        document.body.classList.remove("fd165-major-dragging");

        document.removeEventListener("pointermove", moveDrag, true);
        document.removeEventListener("pointerup", finishDrag, true);
        document.removeEventListener("pointercancel", cancelDrag, true);
    }

    function finish(event, cancelled) {
        if (!drag || event.pointerId !== drag.pointerId) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const before = captureRects();
        cancelAnimations();

        const finalOrder = cancelled
            ? drag.startOrder
            : drag.targetOrder;

        try {
            drag.handle.releasePointerCapture(event.pointerId);
        } catch (_) {}

        drag.rail.classList.remove("fd165-major-following");
        drag.rail.style.removeProperty("transform");

        applyOrderBare(finalOrder);
        animateFrom(before);

        if (!cancelled) {
            try {
                localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify(finalOrder)
                );
            } catch (_) {}
        }

        cleanupDrag();
        drag = null;
    }

    function finishDrag(event) {
        finish(event, false);
    }

    function cancelDrag(event) {
        finish(event, true);
    }

    function beginDrag(event, key, handle, rail) {
        if (event.button !== 0 || drag) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        cancelAnimations();

        const rect = rail.getBoundingClientRect();
        const start = currentOrder();

        drag = {
            key,
            handle,
            rail,
            pointerId: event.pointerId,
            grabOffset: event.clientX - rect.left,
            baseLeft: rect.left,
            dx: 0,
            startOrder: [...start],
            currentOrder: [...start],
            targetOrder: [...start],
        };

        rail.classList.add("fd165-major-following");
        handle.classList.add("fd165-major-handle-active");
        document.body.classList.add("fd165-major-dragging");

        try {
            handle.setPointerCapture(event.pointerId);
        } catch (_) {}

        document.addEventListener("pointermove", moveDrag, true);
        document.addEventListener("pointerup", finishDrag, true);
        document.addEventListener("pointercancel", cancelDrag, true);
    }

    function installMajorDrag() {
        if (!resolveMajor()) return;

        document.querySelectorAll(
            ".fd-slam-major-handle-v5," +
            ".fd-slam-major-handle-v8," +
            ".fd151-live-handle," +
            ".fd16-major-handle," +
            ".fd164-major-handle," +
            ".fd165-major-handle"
        ).forEach(node => node.remove());

        for (const [key, section] of sections) {
            const handle = document.createElement("button");
            handle.type = "button";
            handle.className = "fd165-major-handle";
            handle.setAttribute("aria-label", `Move ${key} section`);
            handle.title = `Drag ${key} section`;

            const grip = document.createElement("span");
            grip.className = "fd165-major-grip";
            grip.setAttribute("aria-hidden", "true");

            handle.appendChild(grip);

            handle.addEventListener(
                "pointerdown",
                event => beginDrag(event, key, handle, section),
                true
            );

            section.prepend(handle);
        }

        try {
            const saved = JSON.parse(
                localStorage.getItem(STORAGE_KEY) || "null"
            );

            if (
                Array.isArray(saved) &&
                saved.length === 3 &&
                ["robot", "center", "car"].every(key => saved.includes(key))
            ) {
                applyOrderBare(saved);
            }
        } catch (_) {}
    }

    function applyAll() {
        normalizeSelectOwners();
        moveCarLayerToggles();
        normalizeZoomButtons();
        normalizeGrayCarActions();
    }

    function boot() {
        applyAll();
        installMajorDrag();

        let pass = 0;

        const settle = () => {
            pass += 1;
            applyAll();

            if (pass < 8) {
                window.setTimeout(settle, 120);
            }
        };

        window.setTimeout(settle, 120);
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () => requestAnimationFrame(boot),
            { once: true }
        );
    } else {
        requestAnimationFrame(boot);
    }
})();

/* ===== END full_dashboard_parity_v165.js ===== */

/* ===== BEGIN full_dashboard_parity_v166.js ===== */
(() => {
"use strict";
/* FULL_DASH_SLAM_PARITY_JS_V166 */
const $=id=>document.getElementById(id);
const norm=v=>String(v||"").replace(/\s+/g," ").trim().toLowerCase();


const cfg={
 "partial-sessions":{refresh:"refresh-partials",fallback:"No saved sessions"},
 "maps":{refresh:"refresh-maps",fallback:"Select map"},
 "car-maps":{refresh:"car-refresh-maps",fallback:"Select map"},
 "car-pick-mode":{refresh:null,fallback:"G1 destination",top:true}
};
const owners=new Map();
function closeAll(except=null){for(const [id,s] of owners)if(id!==except)s.shell.classList.remove("fd166-open")}
function labelFor(sel,opt){
 let t=String(opt?.textContent||"").trim().replace(/…+$/,"").trim();
 if(sel.id==="car-pick-mode"&&norm(t)==="g1 destination (v3)")t="G1 destination";
 return t;
}
function allowed(sel,opt){return sel.id!=="car-pick-mode"||opt.value!=="car-tf"}

function dropdown(id){
 const sel=$(id),c=cfg[id]; if(!sel||!c||owners.has(id))return;
 sel.classList.add("fd166-native-select");
 const shell=document.createElement("div"); shell.className="fd166-select-shell";
 const trig=document.createElement("button"); trig.type="button";trig.className="fd166-select-trigger";
 const lab=document.createElement("span");lab.className="fd166-select-label";
 const chev=document.createElement("span");chev.className="fd166-select-chevron";chev.setAttribute("aria-hidden","true");
 const menu=document.createElement("div");menu.className="fd166-select-menu";trig.append(lab,chev);shell.append(trig,menu);
 const state={sel,c,shell,trig,lab,menu};owners.set(id,state);
 const refresh=c.refresh?$(c.refresh):null;

 if(c.top){
   const source=sel.closest("label"); if(source)source.classList.add("fd166-car-pick-source-hidden");
   const panel=$("car-panel");
   if(panel){
     panel.querySelectorAll(".fd16-dropdown,.fd163-dropdown,.fd164-dropdown,[class*='pick-dropdown'],[data-fd16-select='car-pick-mode']").forEach(n=>n.remove());
     [...panel.querySelectorAll("button,[role='button']")].forEach(n=>{
       const t=norm(n.textContent);
       if(t==="g1 destination"||t==="g1 destination (v3)"){const p=n.parentElement;if(p&&!p.contains(sel))p.remove();else n.remove()}
     });
   }
   const layers=$("fd165CenterCarLayers"),pose=document.querySelector(".workspace .topbar .pose-bar");
   if(!layers&&!pose)return;
   let host=$("fd166CenterPickHost");
   if(!host){host=document.createElement("span");host.id="fd166CenterPickHost";(layers||pose).append(host)}
   host.append(shell);
 }else{
   const row=sel.closest(".select-row"); if(!row)return;
   row.classList.add("fd166-select-row"); if(refresh)refresh.classList.add("fd166-refresh");
   [...row.children].forEach(n=>{if(n!==sel&&n!==refresh&&n!==shell)n.remove()});
   refresh?row.insertBefore(shell,refresh):row.append(shell);
 }

 const rebuild=()=>{
   menu.replaceChildren();
   const opts=[...sel.options].filter(o=>allowed(sel,o));
   const chosen=sel.options[sel.selectedIndex];
   lab.textContent=labelFor(sel,chosen)||c.fallback;
   if(!opts.length){const e=document.createElement("button");e.type="button";e.disabled=true;e.className="fd166-select-option fd166-selected";e.textContent=c.fallback;menu.append(e);return}
   opts.forEach(o=>{
     const x=document.createElement("button");x.type="button";x.className="fd166-select-option";x.textContent=labelFor(sel,o)||c.fallback;
     if(o.value===sel.value)x.classList.add("fd166-selected");
     x.addEventListener("click",ev=>{ev.preventDefault();ev.stopPropagation();sel.value=o.value;sel.dispatchEvent(new Event("input",{bubbles:true}));sel.dispatchEvent(new Event("change",{bubbles:true}));rebuild();shell.classList.remove("fd166-open")});
     menu.append(x);
   });
 };
 state.rebuild=rebuild;
 trig.addEventListener("click",ev=>{ev.preventDefault();ev.stopPropagation();const open=!shell.classList.contains("fd166-open");closeAll(open?id:null);rebuild();shell.classList.toggle("fd166-open",open)});
 sel.addEventListener("change",rebuild); rebuild();
}

function topButtons(){["follow-robot","zoom-out","zoom-in","fit-map"].forEach(id=>$(id)?.classList.add("fd166-top-action"))}

function rightBar(){
 const pick=$("car-pick-mode");pick?.closest("label")?.classList.add("fd166-car-pick-source-hidden");
 $("car-refresh-maps")?.classList.add("fd166-refresh");
 ["car-mapping","car-localization","car-stop","car-save-map","car-align","car-tf-flip","car-standalone","car-center","car-transform","car-initial-pose","car-preview","car-go"].forEach(id=>{
   const b=$(id);if(!b)return;["background","color","font-weight","font-size"].forEach(p=>b.style.removeProperty(p));
 });
}

function all(){dropdown("partial-sessions");dropdown("maps");dropdown("car-maps");dropdown("car-pick-mode");topButtons();rightBar()}
function boot(){
 all();let n=0;
 const settle=()=>{n++;all();for(const s of owners.values())s.rebuild?.();if(n<10)setTimeout(settle,140)};
 setTimeout(settle,140);
 document.addEventListener("click",()=>closeAll(),true);
}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>requestAnimationFrame(boot),{once:true}):requestAnimationFrame(boot);
})();

/* ===== END full_dashboard_parity_v166.js ===== */

/* ==================================================================
   FULL_DASH_SLAM_SINGLE_OWNER_JS_V17
   ================================================================== */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const norm = v => String(v || "").replace(/\s+/g," ").trim().toLowerCase();

  function retireOldPresentation(root=document) {
    root.querySelectorAll(
      ".fd15-dropdown,.fd16-dropdown,.fd163-dropdown,.fd164-dropdown,"
      + ".fd166-select-shell,.fd-partial-dropdown-v6,.fd-map-dropdown-v7,"
      + "[class*='fd-car-pick-dropdown']"
    ).forEach(n => n.remove());

    root.querySelectorAll(".fd15-live-indicator,.fd151-live-indicator,[class*='segment-indicator']")
      .forEach(n => {
        if (!n.closest(".fd-map-primary-row-v5,.fd-map-secondary-row-v5")) n.remove();
      });
  }


  function syncPauseGlyph() {
    const mapPause = $("pause-map");
    if (!mapPause) return;
    const state = mapPause.dataset.slamPauseState;
    mapPause.textContent = state === "resume" ? "▶ Resume" : "Ⅱ Pause";
  }

  const dropdownState = new Map();

  function closeMenus(except=null) {
    for (const [id,s] of dropdownState) {
      if (id === except) continue;
      s.root.classList.remove("open");
      s.trigger.setAttribute("aria-expanded","false");
      s.menu.hidden = true;
    }
  }

  function cleanText(select, option, fallback) {
    let t = String(option?.textContent || "").trim().replace(/…+$/,"").trim();
    if (select.id === "car-pick-mode" && norm(t) === "g1 destination (v3)") {
      t = "G1 destination";
    }
    return t || fallback;
  }

  function makeDropdown(select, {fallback, refreshId=null, top=false}) {
    if (!select || dropdownState.has(select.id)) return dropdownState.get(select.id);

    select.classList.add("fd17-native-select");

    const root = document.createElement("div");
    root.className = "fd17-health-dropdown" + (top ? "" : " fd17-wide");

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "fd17-health-trigger";
    trigger.setAttribute("aria-haspopup","listbox");
    trigger.setAttribute("aria-expanded","false");

    const label = document.createElement("span");
    label.className = "fd17-health-label";

    const chevron = document.createElement("span");
    chevron.className = "fd17-health-chevron";
    chevron.setAttribute("aria-hidden","true");

    trigger.append(label, chevron);
    root.append(trigger);

    const menu = document.createElement("div");
    menu.className = "fd17-health-menu";
    menu.hidden = true;
    menu.setAttribute("role","listbox");
    document.body.append(menu);

    const state = {select,root,trigger,label,menu,fallback,refreshId,top};
    dropdownState.set(select.id,state);

    function visibleOptions() {
      return [...select.options].filter(o => {
        if (select.id === "car-pick-mode" && o.value === "car-tf") return false;
        return true;
      });
    }

    function positionMenu() {
      if (menu.hidden) return;
      const r = trigger.getBoundingClientRect();
      menu.style.left = `${Math.round(r.left)}px`;
      menu.style.top = `${Math.round(r.bottom + 5)}px`;
      menu.style.width = `${Math.round(r.width)}px`;
    }

    function sync() {
      const chosen = select.options[select.selectedIndex];
      label.textContent = cleanText(select, chosen, fallback);
      trigger.disabled = !!select.disabled;

      menu.replaceChildren();
      for (const option of visibleOptions()) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "fd17-health-option";
        b.dataset.value = option.value;
        b.textContent = cleanText(select, option, fallback);
        if (option.value === select.value) b.classList.add("selected");
        b.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          select.value = option.value;
          select.dispatchEvent(new Event("input",{bubbles:true}));
          select.dispatchEvent(new Event("change",{bubbles:true}));
          sync();
          root.classList.remove("open");
          trigger.setAttribute("aria-expanded","false");
          menu.hidden = true;
        });
        menu.append(b);
      }
    }

    trigger.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const open = menu.hidden;
      closeMenus(open ? select.id : null);
      sync();
      menu.hidden = !open;
      root.classList.toggle("open", open);
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) positionMenu();
    });

    select.addEventListener("change", sync);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);

    state.sync = sync;
    sync();
    return state;
  }

  function rebuildStandardDropdown(selectId, refreshId, fallback) {
    const select = $(selectId);
    if (!select) return;
    const row = select.closest(".select-row");
    if (!row) return;

    const refresh = refreshId ? $(refreshId) : null;

    /* Remove every older visual sibling, but keep the native select and refresh. */
    [...row.children].forEach(n => {
      if (n === select || n === refresh) return;
      n.remove();
    });

    row.className = "select-row fd17-select-row";
    if (refresh) refresh.classList.add("fd17-refresh");

    const state = makeDropdown(select,{fallback,refreshId});
    if (!state) return;

    if (refresh) row.insertBefore(state.root, refresh);
    else row.append(state.root);
  }

  function rebuildTopArea() {
    const topbar = document.querySelector(".workspace > .topbar");
    const pose = topbar?.querySelector(".pose-bar");
    const actions = topbar?.querySelector(".top-actions");
    if (!topbar || !pose || !actions) return;

    let left = $("fd17-top-left");
    if (!left) {
      left = document.createElement("div");
      left.id = "fd17-top-left";
      topbar.insertBefore(left, actions);
    }

    /* Locate the two layer checkbox labels wherever older versions left them. */
    const labels = [...document.querySelectorAll("label")].filter(l => {
      const t = norm(l.textContent);
      return t === "car map (orange)" || t === "car scan (pink)";
    });

    labels.sort((a,b) => {
      const ta = norm(a.textContent);
      const tb = norm(b.textContent);
      if (ta.startsWith("car map")) return -1;
      if (tb.startsWith("car map")) return 1;
      return 0;
    });

    for (const l of labels) {
      l.classList.add("fd17-layer-toggle");
      left.append(l);
    }

    const pick = $("car-pick-mode");
    if (pick) {
      /* Remove every older visible G1-destination presentation. */
      document.querySelectorAll(
        ".fd166-select-shell,.fd16-dropdown,.fd163-dropdown,.fd164-dropdown,"
        + "[class*='fd-car-pick-dropdown']"
      ).forEach(n => n.remove());

      const sourceLabel = pick.closest("label");
      if (sourceLabel) sourceLabel.style.display = "none";

      const state = makeDropdown(pick,{fallback:"G1 destination",top:true});
      if (state) {
        state.root.classList.remove("fd17-wide");
        left.append(state.root);
      }
    }

    let status = $("fd17-slam-statusbar");
    if (!status) {
      status = document.createElement("div");
      status.id = "fd17-slam-statusbar";
      topbar.insertAdjacentElement("afterend",status);
    }

    status.append(pose);
  }

  function boot() {
    retireOldPresentation();
    syncPauseGlyph();

    rebuildStandardDropdown("partial-sessions","refresh-partials","No saved sessions");
    rebuildStandardDropdown("maps","refresh-maps","Select map");
    rebuildStandardDropdown("car-maps","car-refresh-maps","Select map");
    rebuildTopArea();

    let pass = 0;
    const settle = () => {
      pass += 1;
      retireOldPresentation();
      syncPauseGlyph();
      rebuildTopArea();
      for (const s of dropdownState.values()) s.sync?.();
      if (pass < 12) setTimeout(settle,120);
    };
    setTimeout(settle,120);

    document.addEventListener("click",() => closeMenus(),true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",() => requestAnimationFrame(boot),{once:true});
  } else {
    requestAnimationFrame(boot);
  }
})();
