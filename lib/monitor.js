const { MONITOR_PATH } = require("./constants.json");
const { sendError, send } = require("./utils");
const Deque = require("collections/deque");
const os = require("os");

const DEFAULT_METRICS = {
    rss: () => process.memoryUsage().rss,
    heapTotal: () => process.memoryUsage().heapTotal,
    heapUsed: () => process.memoryUsage().heapUsed,
    loadavg: () => os.loadavg()[0],
    freemem: () => os.freemem(),
};

module.exports = async function (log, instance, opts) {
    if (opts.monitor) {
        const metrics = Object.assign({}, DEFAULT_METRICS, opts.monitor.metrics);
        const keys = Object.keys(metrics);
        const results = {};
        keys.forEach(key => results[key] = new Deque());
        const maxDequeLength = opts.monitor.maxStoreLength || 600;
        setInterval(() => {
            const now = new Date().getTime();
            keys.forEach(key => {
                results[key].push({
                    time: now,
                    value: metrics[key]()
                });
                if (results[key].length > maxDequeLength) {
                    results[key].shift();
                }
            });
        }, opts.monitor.interval || 1000).unref();
        instance.get(opts.prefix + MONITOR_PATH + "/:key/:seconds", (req, rep) => {
            const key = req.params.key;
            if (!keys.includes(key)) {
                return sendError(rep, 400, `${key} is not a valid key.`);
            }
            let seconds = parseInt(req.params.seconds);
            if (Number.isNaN(seconds)) {
                return sendError(rep, 400, `${req.params.seconds} is not a number.`);
            }
            if (seconds <= 0) {
                return handleInstant(req, rep);
            }
            const now = new Date().getTime();
            const earliestTime = now - seconds * 1000;
            const deque = results[key].toArray();
            let sum = 0, count = 0, min = Number.MAX_SAFE_INTEGER, max = Number.MIN_SAFE_INTEGER;
            for (let i = deque.length - 1; i >= 0; i--) {
                const p = deque[i];
                if (p.time < earliestTime) {
                    break;
                }
                min = Math.min(min, p.value);
                max = Math.max(max, p.value);
                sum += p.value;
                count++;
            }
            send(rep, {
                min: count ? min : 0,
                max: count ? max : 0,
                avg: count ? parseFloat((sum / count).toFixed(2)) : 0,
            });
        });

        function handleInstant(req, rep) {
            const key = req.params.key;
            if (!keys.includes(key)) {
                return sendError(rep, 400, `${key} is not a valid key.`);
            }
            send(rep, { value: metrics[key]() });
        }

        instance.get(opts.prefix + MONITOR_PATH + "/:key", handleInstant);

    }
}
