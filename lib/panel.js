const { PANEL_PATH } = require("./constants.json");
const { send } = require("./utils");
const path = require("path");

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
        instance.register(require("fastify-static"), {
            root: path.join(__dirname, "..", "panel"),
            prefix: opts.prefix + PANEL_PATH
        });
        instance.get(opts.prefix + PANEL_PATH, (req, rep) => {
            rep.sendFile("main.html");
            //TODO do it without static
        });
        instance.get(opts.prefix + PANEL_PATH + "/config", (req, rep) => {
            send(rep, {
                metrics
            });
        });
        instance.get(opts.prefix + PANEL_PATH + "/chart.js", (req, rep) => {
            rep.sendFile("Chart.min.js", path.join(process.cwd(), "node_modules", "chart.js", "dist"));
        });
        instance.get(opts.prefix + "/ping", (req, rep) => rep.header("cache-control", "max-age=0, private, must-revalidate").send("pong"));
        //TODO add websocket
    }
}