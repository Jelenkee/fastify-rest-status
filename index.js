const fp = require("fastify-plugin");

const NAME = "fastify-rest-status";

function plugin(instance, opts, done) {
    opts = opts || {};
    const getOnly = opts.getOnly || false;
    const prefix = "/status";
    const loggerOptions = { name: NAME };
    if (typeof opts.logLevel === "string") {
        loggerOptions.level = opts.logLevel;
    }
    const logger = instance.log.child(loggerOptions);

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
        instance.get(prefix + "/logger/level", (req, rep) => {
            send(rep, { level: logger.level });
        });
        if (!getOnly) {
            instance.post(prefix + "/logger/level", (req, rep) => {
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

    const config = opts.config || false;
    if (config) {
        const configObject = Object.assign({}, config.defaultConfig);
        const configTransformer = config.configTransformer || ((k, v) => v);
        const onChange = config.onChange || (() => { });
        const saveFunc = convertToAsync(config.save || (() => { })), loadFunc = convertToAsync(config.load || (() => ({})));
        loadFunc()
            .then(object => {
                Object.assign(configObject, object);
                logger.info("Config loaded.");
            }).catch(e => {
                logger.error("Config couldn't be loaded. " + e.message);
            });

        instance.get(prefix + "/config/:key", (req, rep) => {
            send(rep, { [req.params.key]: getConfigValue(req.params.key) || null });
        });
        instance.get(prefix + "/config", (req, rep) => {
            send(rep, configObject);
        });
        instance.post(prefix + "/config/:key", (req, rep) => {
            try {
                const val = req.query.value || getBody(req).value;
                setConfigValue(req.params.key, val);
                sendSuccess(rep, `Config ${req.params.key} set to ${val}`);
            } catch (error) {
                sendError(rep, 400, error.message);
            }
        });
        instance.decorate("getConfigValue", getConfigValue);
        instance.decorateRequest("getConfigValue", getConfigValue);
        instance.decorate("setConfigValue", setConfigValue);
        instance.decorateRequest("setConfigValue", setConfigValue);

        function getConfigValue(key, fallback, setFallback) {
            if (key in configObject) {
                return configObject[key];
            } else {
                if (setFallback) {
                    setConfigValue(key, fallback);
                }
                return fallback;
            }
        }

        function setConfigValue(key, value) {
            const oldValue = configObject[key];
            const newValue = configTransformer(key, value);
            if (oldValue !== newValue) {
                configObject[key] = newValue;
                onChange(key, newValue);
                logger.debug(`Config ${key} set to ${newValue}.`)
                saveConfig();
            }
        }

        function saveConfig() {
            saveFunc(configObject)
                .then(() => {
                    logger.info("Config saved.");
                }).catch(e => {
                    logger.error("Config couldn't be saved. " + e.message);
                });
        }

        function convertToAsync(func) {
            if (!func) {
                return;
            }
            return async function (object) {
                return func(object);
            };

        }
    }


    if (!getOnly) {
        instance.addContentTypeParser('*', { parseAs: "string" }, function (request, payload, done) {
            done(null, payload)
        })
    }

    function getBody(req) {
        return (typeof req.body === "object" ? req.body : JSON.parse(req.body));
    }

    function sendSuccess(rep, message) {
        send(rep, { success: true, message })
    }

    function sendError(rep, status, message) {
        send(rep.status(status), { error: message });
    }

    function send(rep, object) {
        rep.send(object);
    }

    done();
}


module.exports = fp(plugin, {
    fastify: ">=3.x.x",
    name: NAME,
});

console.log(__filename);
/*const f=require("fastify")({logger:true});
f.register(module.exports,{logger:true,config:true});
f.listen(3434,(e,a)=>{
    console.log(a);
    f.getConfigValue("d");
});*/
