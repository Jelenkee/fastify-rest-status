const { getBody, sendSuccess, sendError, send } = require("./utils");
const { LOG_LEVEL_PATH } = require("./constants.json");

module.exports = async function (log, instance, opts) {
    (logger => {
        if (logger !== undefined) {
            if (typeof logger === "object" && typeof logger.level === "string") {
                addLoggerRoutes(logger);
            } else if (logger) {
                addLoggerRoutes(instance.log);
            }
        }
    })(opts.logger);

    function addLoggerRoutes(logger) {
        instance.get(opts.prefix + LOG_LEVEL_PATH, (req, rep) => {
            send(rep, { level: logger.level });
        });
        instance.put(opts.prefix + LOG_LEVEL_PATH, (req, rep) => {
            try {
                const newLevel = req.query.level || getBody(req).level;
                if (newLevel) {
                    logger.level = logger.levels.labels[newLevel] || newLevel;
                    sendSuccess(rep, `Log level set to ${logger.level}`);
                } else {
                    sendError(rep, 400, "Missing log level");
                }
            } catch (error) {
                sendError(rep, 400, error.message);
            }
        });
    }
}