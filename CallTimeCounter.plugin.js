/**
 * @name CallTimeCounter
 * @author QWERT, KingGamingYT
 * @description Shows how long you personally have been connected to the current voice channel.
 * @version 2.1.0
 */
// Fix by bigsecretofind + Copilot for assistance 
module.exports = class CallTimeCounter {
    start() {
        this.startTime = null;
        this.currentChannel = null;
        this.interval = null;
        this.timer = null;
        this.timerHost = null;

        this.SelectedChannelStore =
            BdApi.Webpack.getStore("SelectedChannelStore");

        this.Dispatcher =
            BdApi.Webpack.getByKeys(
                "dispatch",
                "subscribe",
                "register",
                { searchExports: true }
            );

        if (!this.SelectedChannelStore) {
            BdApi.UI.showToast(
                "CallTimeCounter: SelectedChannelStore was not found.",
                { type: "error" }
            );
            return;
        }

        this.handleVoiceChange =
            this.handleVoiceChange.bind(this);

        this.onRTCState = (event) => {
            if (!event) return;

            if (
                event.state === "RTC_DISCONNECTED" &&
                this.currentChannel
            ) {
                this.startTime = Date.now();
                this.renderTimer();
            }
        };

        if (
            typeof this.SelectedChannelStore
                .addChangeListener === "function"
        ) {
            this.SelectedChannelStore.addChangeListener(
                this.handleVoiceChange
            );
        }

        this.Dispatcher?.subscribe?.(
            "RTC_CONNECTION_STATE",
            this.onRTCState
        );

        this.handleVoiceChange();

        this.interval = setInterval(() => {
            this.handleVoiceChange();
            this.renderTimer();
        }, 1000);
    }

    getVoicePanel() {
        const voiceNode = document.querySelector(
            '[class*="rtcConnectionStatus"]'
        );

        if (!voiceNode) {
            return null;
        }

        let element = voiceNode;

        for (let level = 0; level < 8; level++) {
            if (!element) break;

            const buttonCount =
                element.querySelectorAll("button").length;

            if (buttonCount >= 3) {
                return {
                    voiceNode,
                    panel: element
                };
            }

            element = element.parentElement;
        }

        return {
            voiceNode,
            panel:
                voiceNode.parentElement?.parentElement ||
                voiceNode.parentElement
        };
    }

    handleVoiceChange() {
        const channel =
            this.SelectedChannelStore
                .getVoiceChannelId();

        if (!channel) {
            this.currentChannel = null;
            this.startTime = null;
            this.removeTimer();
            return;
        }

        if (channel !== this.currentChannel) {
            this.currentChannel = channel;
            this.startTime = Date.now();
        }

        this.renderTimer();
    }

    createTimer(panel) {
        this.removeTimer();

        const computedPosition =
            window.getComputedStyle(panel).position;

        if (computedPosition === "static") {
            panel.style.position = "relative";
            panel.dataset.callTimeCounterPosition =
                "changed";
        }

        const timer =
            document.createElement("div");

        timer.id = "call-time-counter-panel";

        Object.assign(timer.style, {
            position: "absolute",
            right: "16px",
            top: "36px",
            zIndex: "5",
            fontSize: "11px",
            lineHeight: "14px",
            fontWeight: "500",
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            userSelect: "none"
        });

        panel.appendChild(timer);

        this.timer = timer;
        this.timerHost = panel;

        return timer;
    }

    renderTimer() {
        if (
            !this.currentChannel ||
            !this.startTime
        ) {
            this.removeTimer();
            return;
        }

        const result = this.getVoicePanel();

        if (!result || !result.panel) {
            return;
        }

        let timer =
            document.getElementById(
                "call-time-counter-panel"
            );

        if (
            !timer ||
            !timer.isConnected ||
            this.timerHost !== result.panel
        ) {
            timer =
                this.createTimer(result.panel);
        }

        const elapsed = Math.max(
            0,
            Date.now() - this.startTime
        );

        const hours = String(
            Math.floor(elapsed / 3600000)
        ).padStart(2, "0");

        const minutes = String(
            Math.floor(
                (elapsed % 3600000) / 60000
            )
        ).padStart(2, "0");

        const seconds = String(
            Math.floor(
                (elapsed % 60000) / 1000
            )
        ).padStart(2, "0");

        timer.textContent =
            "You: " +
            hours +
            ":" +
            minutes +
            ":" +
            seconds;
    }

    removeTimer() {
        const timer =
            document.getElementById(
                "call-time-counter-panel"
            );

        if (timer) {
            timer.remove();
        }

        if (
            this.timerHost &&
            this.timerHost.dataset
                .callTimeCounterPosition ===
                "changed"
        ) {
            this.timerHost.style.position = "";

            delete this.timerHost.dataset
                .callTimeCounterPosition;
        }

        this.timer = null;
        this.timerHost = null;
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }

        if (
            this.SelectedChannelStore &&
            typeof this.SelectedChannelStore
                .removeChangeListener ===
                "function"
        ) {
            this.SelectedChannelStore
                .removeChangeListener(
                    this.handleVoiceChange
                );
        }

        this.Dispatcher?.unsubscribe?.(
            "RTC_CONNECTION_STATE",
            this.onRTCState
        );

        this.removeTimer();

        this.startTime = null;
        this.currentChannel = null;
        this.SelectedChannelStore = null;
        this.Dispatcher = null;
    }
};
