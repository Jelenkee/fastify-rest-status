const { PANEL_PATH } = require("./constants.json");
const { send } = require("./utils");
const path = require("path");
const List = require("collections/list");
const { Stream } = require("stream");

module.exports = async function (log, instance, opts) {
    const panel = opts.panel;
    if (panel) {
        const sockets = new List();
        instance.register((instance, _, done) => {
            instance.register(require("fastify-static"), {
                //root: [path.join(process.cwd(), "panel"), path.join(process.cwd(), "node_modules")],
                root: path.join(process.cwd(), "panel"),
                prefix: opts.prefix + PANEL_PATH,
            });
            instance.get(opts.prefix + PANEL_PATH, {
                onSend(req, rep, payload, done) {
                    if (payload instanceof Stream) {
                        let data = "";
                        payload.on("data", chunk => data += chunk);
                        payload.on("error", done);
                        payload.on("end", () => done(null, replace(data)));
                    } else {
                        if (typeof payload === "string" && payload) {
                            payload = replace(payload);
                        }
                        done(null, payload);
                    }

                    function replace(string) {
                        rep.header("content-length", null);
                        const url = new URL(req.url, `${req.protocol}://${req.hostname}`);
                        return string.replace("PATH_PLACEHOLDER", "/" + url.pathname.split("\/").filter(Boolean).filter((v, i, a) => i !== a.length - 1).join("/"));
                    }
                }
            }, (req, rep) => {
                rep.sendFile("main.html");
                //TODO do it without static
            });
            const sections = [
                { id: "system", name: "System" },
            ];
            const metrics = panel.metrics || [];
            const metricsEnabled = instance.getMetric && metrics.length;
            metricsEnabled && sections.push({ id: "metrics", name: "Metrics" });
            instance.getConfigValue && sections.push({ id: "config", name: "Configuration" });
            instance.getCronjob && sections.push({ id: "cron", name: "Cronjobs" });
            (opts.script || instance.runAction) && sections.push({ id: "scripts", name: "Script" });
            instance.get(opts.prefix + PANEL_PATH + "/config", (req, rep) => {
                send(rep, {
                    metrics: metrics,
                    logo: panel.logo,
                    title: panel.title,
                    sections,
                });
            });
            instance.get(opts.prefix + PANEL_PATH + "/chart.js", (req, rep) => {
                rep.sendFile("chart.min.js", path.join(require.resolve("chart.js"), ".."));
            });
            if (metricsEnabled) {
                if (!instance.websocketServer) {
                    instance.register(require("fastify-websocket"), {
                        maxPayload: 1024 * 1024
                    });
                }
                instance.get(opts.prefix + PANEL_PATH + "/socket", { websocket: true }, (connection, req) => {
                    connection.socket.on("close", () => sockets.delete(connection.socket));
                    connection.socket.on("error", () => console.log("error"));
                    connection.socket.on("message", () => console.log("message"));
                    sockets.push(connection.socket);
                });
                for (let i = 0; i < metrics.length; i++) {
                    const metric = metrics[i];
                    setInterval(() => {
                        sockets.forEach(socket => {
                            socket.send(JSON.stringify({ index: i, values: instance.getMetric(metric.id, metric.seconds) }));
                        });
                    }, metric.interval || 1000);
                }
            }
            done();
        });
    }
}