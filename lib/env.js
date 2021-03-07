const { ENV_PATH } = require("./constants.json");
const { send } = require("./utils");

module.exports = async function (log, instance, opts) {
    if (opts.env) {
        instance.get(opts.prefix + ENV_PATH, (req, rep) => {
            send(rep, process.env);
        });
    }
}