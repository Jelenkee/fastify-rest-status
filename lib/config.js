const { sendSuccess, sendError, send, convertToAsync } = require("./utils");
const { CONFIG_PATH } = require("./constants.json");

module.exports = async function (log, instance, opts) {
    const config = opts.config;
    if (typeof config === "object") {
        const configObject = Object.assign({}, config.defaultConfig);
        const configValues = {};
        Object.entries(configObject).forEach(([k, v]) => {
            v && (configValues[k] = v.value);
        });
        const configTransformer = config.configTransformer || ((k, v) => v);
        const onChange = config.onChange || (() => { });
        const saveFunc = convertToAsync(config.save || (() => { })), loadFunc = convertToAsync(config.load || (() => ("{}")));

        instance.get(opts.prefix + CONFIG_PATH + "/:key", (req, rep) => {
            send(rep, mergeConfigEntry(req.params.key));
        });
        instance.get(opts.prefix + CONFIG_PATH, (req, rep) => {
            const result = {};
            Object.keys(configValues).forEach(k => result[k] = mergeConfigEntry(k));
            send(rep, result);
        });

        function mergeConfigEntry(key) {
            return Object.assign(configObject[key] || {}, { value: configValues[key] });
        }
        instance.put(opts.prefix + CONFIG_PATH + "/:key", {
            schema: {
                body: {
                    type: "object",
                    properties: {
                        value: {
                            type: ["string", "number", "boolean"]
                        }
                    },
                    required: ["value"]
                }
            }
        }, (req, rep) => {
            try {
                const val = req.body.value;
                setConfigValue(req.params.key, val);
                sendSuccess(rep, `Config ${req.params.key} set to ${val}`);
            } catch (error) {
                sendError(rep, 400, error.message);
            }
        });
        instance.decorate("getConfigValue", getConfigValue);
        instance.decorate("setConfigValue", setConfigValue);

        return loadFunc()
            .then(string => {
                Object.assign(configValues, JSON.parse(string));
                if (!Object.keys(configValues).length) {
                    log.warn("No config keys found.");
                    return;
                }
                log.info("Config loaded.");
            }).catch(e => {
                log.warn("Config couldn't be loaded. " + e.message);
            });

        function getConfigValue(key, fallback, setFallback) {
            if (key in configValues) {
                return configValues[key];
            } else {
                if (setFallback) {
                    setConfigValue(key, fallback);
                }
                return fallback;
            }
        }

        function setConfigValue(key, value) {
            if (!(key in configValues)) {
                throw new Error("Adding new config values during runtime is not allowed.");
            }
            if (value == null) {
                throw new Error(`Config value must not be ${value}. Use an empty string instead.`);
            }
            const oldValue = configValues[key];
            const newValue = configTransformer(key, value);
            if (oldValue !== newValue) {
                configValues[key] = newValue;
                onChange(key, newValue, oldValue);
                log.debug(`Config ${key} set to ${newValue}.`)
                saveConfig();
            }
        }

        function saveConfig() {
            saveFunc(JSON.stringify(configValues))
                .then(() => {
                    log.info("Config saved.");
                }).catch(e => {
                    log.warn("Config couldn't be saved. " + e.message);
                });
        }

    }
}