/**
 * @name CallTimeCounterFix
 * @author QWERT, KingGamingYT
 * @description Shows how much time you are in a voice chat. (fixed build)
 * @version 1.0.4
 */

const PLUGIN = "CallTimeCounterFix";
const STYLE = "voiceTimerFix";
const TIMER_CLASS = "voiceTimerFix";
const HOST_CLASS = "voiceTimerHost";
const MAX_HOST_DEPTH = 5;
const RETRY_DELAY = 1000;

const { React } = BdApi;

function matchesPanel(value) {
    if (typeof value !== "function") return false;
    try {
        const source = Function.prototype.toString.call(value);
        return ["RTCConnectionMenu", "childrenAsSubtitle", "hasRemoteVoiceState"].every(m => source.includes(m));
    }
    catch { return false; }
}

function findPanel() {
    try {
        const { Webpack } = BdApi;
        const target = Webpack.getModule(() => true, { declarationFilter: matchesPanel, withKey: true, cacheId: `${PLUGIN}-RTCPanel` });
        if (!Array.isArray(target) || target.length < 2 || !target[0]) return null;
        const [owner, key] = target;
        if (!matchesPanel(owner[key])) return null;
        const descriptor = Object.getOwnPropertyDescriptor(owner, key);
        if (!descriptor || !(descriptor.writable || typeof descriptor.set === "function")) return null;
        return { owner, key };
    }
    catch { return null; }
}

function timerCSS(Webpack) {
    const valid = value => typeof value === "string" && /^[\w-]+$/.test(value);
    let rtc, panel;
    try { rtc = Webpack.getByKeys("rtcConnectionStatus", "ping"); } catch { }
    try { panel = Webpack.getByKeys("connection", "inner"); } catch { }

    const fitClasses = [rtc?.rtcConnectionStatus, panel?.inner, panel?.connection].filter(valid);
    const hosts = Array.from({ length: MAX_HOST_DEPTH }, (_, i) => `.${HOST_CLASS}${i + 1}`);

    let css = `
.${TIMER_CLASS} {
    flex: 0 0 auto !important;
    margin: 0 !important;
    padding: 0 !important;
    font-size: 11px !important;
    line-height: 1.2 !important;
    font-variant-numeric: tabular-nums !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}
${hosts[0]} {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex-wrap: nowrap !important;
    gap: 6px !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    overflow: hidden !important;
}
${hosts[0]} > :first-child {
    flex: 0 1 auto !important;
    min-width: 0 !important;
    max-width: 100% !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
}
${hosts.slice(1, 3).join(", ")} {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
}
${hosts.slice(3).join(", ")} {
    min-width: 0 !important;
    max-width: 100% !important;
}`;

    if (fitClasses.length) css += `\n${fitClasses.map(v => `.${v}`).join(", ")} { height: fit-content; }`;
    if (valid(panel?.channel)) {
        css += `\n.${panel.channel} { text-decoration: none !important; }`;
        css += `\n.${panel.channel} > div:nth-child(1):hover { text-decoration: underline; }`;
    }
    return css;
}

function formatElapsed(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor(total / 60) % 60;
    const s = total % 60;
    return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
}

module.exports = class CallTimeCounterFix {
    constructor() {
        this.active = false;
        this.generation = 0;
        this.timers = new Set();
        this.channelId = null;
        this.startTime = null;
        this.store = null;
        this.dispatcher = null;
        this.Timer = null;
        this.styled = false;
        this.subscribed = false;
        this.listening = false;
        this.retry = null;
    }

    start() {
        this.stop();
        const generation = this.generation;
        const { Webpack, Patcher, DOM } = BdApi;

        if (!React?.createElement || !React?.cloneElement || !React?.isValidElement || !React?.Component
            || !Webpack?.getModule || !Webpack?.getStore || !Webpack?.getByKeys
            || !Patcher?.after || !Patcher?.unpatchAll || !DOM?.addStyle || !DOM?.removeStyle) {
            console.warn(`[${PLUGIN}] Required BetterDiscord APIs are unavailable.`);
            return;
        }

        try {
            if (BdApi.Plugins?.isEnabled?.("CallTimeCounter")) {
                BdApi.UI?.showToast?.(
                    "CallTimeCounterFix: отключите или удалите старый плагин CallTimeCounter. Он добавляет второй таймер в ту же панель и снова растягивает её за границы.",
                    { type: "warning", timeout: 15000 }
                );
            }
        }
        catch { }

        const plugin = this;

        this.Timer = class Timer extends React.Component {
            constructor(props) {
                super(props);
                this.state = { elapsed: 0, visible: false };
                this.mounted = false;
                this.node = null;
                this.hosts = [];
                this.refresh = this.refresh.bind(this);
                this.setNode = this.setNode.bind(this);
            }

            setNode(node) {
                this.clearHosts();
                this.node = node;
                if (node) this.tagHosts();
            }

            tagHosts() {
                if (!this.node) return;
                let node;
                try { node = this.node.parentElement; } catch { return; }
                if (!node) return;
                for (let depth = 1; node && depth <= MAX_HOST_DEPTH; depth++, node = node.parentElement) {
                    const className = `${HOST_CLASS}${depth}`;
                    try {
                        node.classList.add(className);
                        this.hosts.push([node, className]);
                    }
                    catch { }
                }
            }

            clearHosts() {
                for (const [node, className] of this.hosts) {
                    try { node.classList.remove(className); } catch { }
                }
                this.hosts.length = 0;
            }

            refresh() {
                if (!this.mounted || !plugin.active || plugin.generation !== generation) return;
                try {
                    const elapsed = plugin.elapsed(generation);
                    const next = { elapsed: elapsed ?? 0, visible: elapsed !== null };
                    if (next.elapsed !== this.state.elapsed || next.visible !== this.state.visible) {
                        this.setState(next);
                    }
                }
                catch { }
            }

            componentDidMount() {
                if (!plugin.active || plugin.generation !== generation) return;
                try {
                    this.mounted = true;
                    plugin.timers.add(this);
                    if (this.node) { this.clearHosts(); this.tagHosts(); }
                    this.refresh();
                    this.interval = setInterval(this.refresh, 1000);
                }
                catch {
                    this.mounted = false;
                    this.interval = null;
                }
            }

            componentWillUnmount() {
                this.mounted = false;
                clearInterval(this.interval);
                this.interval = null;
                this.clearHosts();
                this.node = null;
                plugin.timers.delete(this);
            }

            render() {
                if (!plugin.active || plugin.generation !== generation || !this.state.visible) return null;
                return React.createElement("div", {
                    className: TIMER_CLASS,
                    title: "Time elapsed",
                    ref: this.setNode
                }, formatElapsed(this.state.elapsed));
            }
        };

        this.active = true;
        this.tryStart(generation);
    }

    tryStart(generation) {
        if (!this.active || this.generation !== generation) return;
        const { Webpack, Patcher, DOM } = BdApi;
        const target = findPanel();
        if (!target) { this.scheduleRetry(generation); return; }

        if (!this.store) try { this.store = Webpack.getStore("SelectedChannelStore"); } catch { }
        if (!this.dispatcher) try {
            this.dispatcher = Webpack.getByKeys("dispatch", "subscribe", "register", { searchExports: true });
        } catch { }

        if (typeof this.store?.getVoiceChannelId !== "function"
            || typeof this.dispatcher?.subscribe !== "function"
            || typeof this.dispatcher?.unsubscribe !== "function") {
            this.scheduleRetry(generation);
            return;
        }

        let unpatch;
        try {
            unpatch = Patcher.after(PLUGIN, target.owner, target.key, (_that, [props], result) => {
                if (!this.active || this.generation !== generation) return;
                try { return this.addTimer(props, result); }
                catch { return result; }
            });
        }
        catch { unpatch = null; }

        if (typeof unpatch !== "function") { this.scheduleRetry(generation); return; }

        if (!this.styled) {
            try { DOM.addStyle(STYLE, timerCSS(Webpack)); this.styled = true; } catch { }
        }

        this.onConnection = event => {
            if (!this.active || this.generation !== generation) return;
            if (event?.state !== "RTC_DISCONNECTED") return;
            if (Object.prototype.hasOwnProperty.call(event, "streamKey")) return;
            this.syncChannel();
            if (this.channelId !== null) this.startTime = Date.now();
            this.refreshTimers();
        };

        try { this.dispatcher.subscribe("RTC_CONNECTION_STATE", this.onConnection); this.subscribed = true; } catch { }

        if (typeof this.store.addChangeListener === "function" && typeof this.store.removeChangeListener === "function") {
            this.onChannelChange = () => {
                if (!this.active || this.generation !== generation) return;
                this.syncChannel();
                this.refreshTimers();
            };
            try { this.store.addChangeListener(this.onChannelChange); this.listening = true; } catch { }
        }

        this.syncChannel();
        this.refreshTimers();
    }

    scheduleRetry(generation) {
        if (!this.active || this.generation !== generation || this.retry) return;
        this.retry = setTimeout(() => {
            this.retry = null;
            this.tryStart(generation);
        }, RETRY_DELAY);
    }

    syncChannel() {
        if (!this.store || typeof this.store.getVoiceChannelId !== "function") {
            this.channelId = null;
            this.startTime = null;
            return;
        }
        let selected = null;
        try { selected = this.store.getVoiceChannelId() || null; } catch { selected = null; }
        if (selected !== this.channelId) {
            this.channelId = selected;
            this.startTime = selected === null ? null : Date.now();
        }
    }

    elapsed(generation) {
        if (!this.active || this.generation !== generation) return null;
        this.syncChannel();
        if (this.channelId === null || this.startTime === null) return null;
        return Math.max(0, Math.round((Date.now() - this.startTime) / 1000) * 1000);
    }

    refreshTimers() {
        for (const timer of this.timers) timer.refresh();
    }

    addTimer(props, result) {
        if (!this.active || !this.Timer) return result;
        try {
            this.syncChannel();
            if (!this.channelId) return result;
            if (props?.hasRemoteVoiceState) return result;
            if (props?.channel?.id !== this.channelId) return result;
            if (!React.isValidElement(result) || result.props.childrenAsSubtitle !== true) return result;
            const focus = result.props.children;
            if (!React.isValidElement(focus)) return result;
            const link = focus.props.children;
            if (!React.isValidElement(link)) return result;
            if (typeof link.props.onContextMenu !== "function") return result;
            if (!Array.isArray(link.props.children) || link.props.children.length < 2) return result;
            const children = link.props.children;
            const subtitle = children[1];
            if (!React.isValidElement(subtitle)) return result;
            const original = subtitle.props.children;
            const content = Array.isArray(original) ? original.slice() : [original];
            const label = content.filter(child => !(React.isValidElement(child) && child.type === this.Timer));
            if (!label.length || !label.every(child => React.isValidElement(child))) return result;
            const timer = React.createElement(this.Timer, { key: `${PLUGIN}-timer` });
            const nextSubtitle = React.cloneElement(subtitle, {}, [...label, timer]);
            const nextLink = React.cloneElement(link, {}, [children[0], nextSubtitle, ...children.slice(2)]);
            return React.cloneElement(result, {}, React.cloneElement(focus, {}, nextLink));
        }
        catch { return result; }
    }

    stop() {
        this.active = false;
        this.generation++;

        for (const timer of Array.from(this.timers)) {
            try {
                timer.mounted = false;
                clearInterval(timer.interval);
                timer.interval = null;
                timer.clearHosts?.();
                timer.node = null;
            }
            catch { }
        }
        this.timers.clear();

        if (this.retry) { clearTimeout(this.retry); this.retry = null; }

        const cleanup = action => { try { action(); } catch { } };
        if (this.subscribed) cleanup(() => this.dispatcher.unsubscribe("RTC_CONNECTION_STATE", this.onConnection));
        if (this.listening) cleanup(() => this.store.removeChangeListener(this.onChannelChange));
        cleanup(() => BdApi.Patcher?.unpatchAll?.(PLUGIN));
        if (this.styled) cleanup(() => BdApi.DOM.removeStyle(STYLE));

        this.subscribed = this.listening = this.styled = false;
        this.channelId = this.startTime = null;
        this.store = this.dispatcher = this.Timer = null;
        this.onConnection = this.onChannelChange = null;
    }
};
