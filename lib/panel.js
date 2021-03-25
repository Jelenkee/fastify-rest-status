const { PANEL_PATH } = require("./constants.json");
const { send } = require("./utils");
const path = require("path");
const { Stream } = require("stream");

module.exports = async function (log, instance, opts) {
    const panel = opts.panel;
    if (panel) {
        const metrics = panel.metrics || [];
        const m = {
            id: "rss",
            name: "RSSbytes",
            chart: {
                min: 0,
                max: 1000
            },
            type: ["min", "max", "avg"],
            range: 10
        }
        panel.title;
        panel.logo;
        panel.dark;
        instance.register((instance, _, done) => {
            instance.register(require("fastify-static"), {
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
            instance.get(opts.prefix + PANEL_PATH + "/config", (req, rep) => {
                send(rep, {
                    metrics
                });
            });
            instance.get(opts.prefix + PANEL_PATH + "/chart.js", (req, rep) => {
                rep.sendFile("Chart.min.js", path.join(require.resolve("chart.js"), ".."));
                //TODO do it without static
            });
            //TODO add websocket
            if (!instance.websocketServer) {
                instance.register(require("fastify-websocket"), {
                    maxPayload: 1024 * 1024
                })
            }
            done();
        });
    }
}