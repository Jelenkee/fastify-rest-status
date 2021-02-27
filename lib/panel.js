const { PANEL_PATH } = require("./constants.json");
const path = require("path");

module.exports = async function (log, instance, opts) {
    const panel = opts.panel;
    if (panel) {
        instance.register(require("fastify-static"), {
            root: path.join(__dirname, "..", "panel"),
            prefix: opts.prefix + PANEL_PATH
        });
        instance.get(opts.prefix + PANEL_PATH, (req, rep) => {
            rep.sendFile("main.html");
            //TODO do it without static
        });
    }
}