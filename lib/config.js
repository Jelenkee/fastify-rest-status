const { getBody, sendSuccess, sendError, send } = require("./utils");
const { CONFIG_PATH } = require("./constants.json");

module.exports = async function (log, instance, opts) {
    const config = opts.config || false;
    if (config) {
        const configObject = Object.assign({}, config.defaultConfig);
        const configTransformer = config.configTransformer || ((k, v) => v);
        const onChange = config.onChange || (() => { });
        const saveFunc = convertToAsync(config.save || (() => { })), loadFunc = convertToAsync(config.load || (() => ({})));

        instance.get(opts.prefix + CONFIG_PATH + "/:key", (req, rep) => {
            send(rep, { [req.params.key]: getConfigValue(req.params.key) || null });
        });
        instance.get(opts.prefix + CONFIG_PATH, (req, rep) => {
            send(rep, configObject);
        });
        instance.put(opts.prefix + CONFIG_PATH + "/:key", (req, rep) => {
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

        return loadFunc()
            .then(object => {
                Object.assign(configObject, object);
                log.info("Config loaded.");
            }).catch(e => {
                log.warn("Config couldn't be loaded. " + e.message);
            });

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
                log.debug(`Config ${key} set to ${newValue}.`)
                saveConfig();
            }
        }

        function saveConfig() {
            saveFunc(configObject)
                .then(() => {
                    log.info("Config saved.");
                }).catch(e => {
                    log.warn("Config couldn't be saved. " + e.message);
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
}