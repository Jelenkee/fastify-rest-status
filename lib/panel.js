const { PANEL_PATH } = require("./constants.json");
const { send } = require("./utils");
const path = require("path");
const fs = require("fs/promises");
const List = require("collections/list");

module.exports = async function (log, instance, opts) {
    const panel = opts.panel;
    if (panel) {
        const sockets = new List();
        instance.register((instance, _, done) => {
            instance.register(require("fastify-static"), {
                root: [path.join(process.cwd(), "panel"), path.join(process.cwd(), "node_modules")],
                prefix: opts.prefix + PANEL_PATH,
            });
            instance.get(opts.prefix + PANEL_PATH, async (req, rep) => {
                rep.type("text/html");
                const file = (await fs.readFile(path.join(process.cwd(), "panel", "main.html"))).toString();
                const url = new URL(req.url, `${req.protocol}://${req.hostname}`);
                return file.replace("PATH_PLACEHOLDER", "/" + url.pathname.split("\/").filter(Boolean).filter((v, i, a) => i !== a.length - 1).join("/"));
            });
            const sections = [
                { id: "system", name: "System" },
            ];
            const metrics = (panel.metrics || []).filter(m => m.id);
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