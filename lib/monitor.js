const { MONITOR_PATH } = require("./constants.json");
const { sendError, send, ErrorWithCode } = require("./utils");
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
        instance.get(opts.prefix + MONITOR_PATH + "/:key/:seconds", {
            schema: {
                params: {
                    seconds: {
                        type: "integer",
                        minimum: 0
                    }
                }
            }
        }, (req, rep) => {
            let seconds = parseInt(req.params.seconds);
            if (Number.isNaN(seconds)) {
                return sendError(rep, 400, `${req.params.seconds} is not a number.`);
            }
            try {
                send(rep, getMetric(req.params.key, seconds))
            } catch (error) {
                sendError(rep, error.code || 500, error.message);
            }
        });

        instance.get(opts.prefix + MONITOR_PATH + "/:key", (req, rep) => {
            try {
                send(rep, getMetric(req.params.key))
            } catch (error) {
                sendError(rep, error.code || 500, error.message);
            }
        });

        function getMetric(key, seconds) {
            seconds |= 0;
            if (!keys.includes(key)) {
                throw new ErrorWithCode(`${key} is not a valid key.`, 404)
            }

            if (seconds <= 0) {
                return metrics[key]();
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
            return {
                min: count ? min : 0,
                max: count ? max : 0,
                avg: count ? parseFloat((sum / count).toFixed(2)) : 0,
            };
        }

        instance.decorate("getMetric", getMetric);

    }
}
