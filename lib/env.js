const { ENV_PATH } = require("./constants.json");

module.exports = async function (log, instance, opts) {
    if (opts.env) {
        instance.get(opts.prefix + ENV_PATH, (req, rep) => {
            rep.send(process.env);
        });
    }
}