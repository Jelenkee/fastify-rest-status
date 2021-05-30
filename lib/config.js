const { sendSuccess, sendError, send, createStore } = require("./utils");
const { CONFIG_PATH } = require("./constants.json");

module.exports = async function (log, instance, opts) {
    const config = opts.config;
    if (typeof config === "object") {
        const configObject = Object.assign({}, config.defaultConfig);
        const persistentStore = await createStore(opts.config);
        const storedKeys = (await persistentStore.entries()).map(e => e[0]);
        await Promise.all(Object.entries(configObject).map(async e => {
            if (!storedKeys.includes(e[0])) {
                typeof e[1].value !== "string" && log.info(`Config value ${e[0]} is not a string. It will be converted.`);
                await persistentStore.set(e[0], String(e[1].value));
            }
        }));
        /*const keys = new Set((await persistentStore.entries()).map(e => e[0]));
        if (!keys.size) {
            log.warn("No config keys found.");
            return;
        }*/

        const configTransformer = config.configTransformer || ((k, v) => v);
        const onChange = config.onChange || (() => { });

        instance.get(opts.prefix + CONFIG_PATH + "/:key", async (req, rep) => {
            send(rep, await mergeConfigEntry(req.params.key));
        });
        instance.get(opts.prefix + CONFIG_PATH, async (req, rep) => {
            const result = {};
            await Promise.all((await persistentStore.entries()).map(async e => result[e[0]] = await mergeConfigEntry(e[0], e[1])));
            send(rep, result);
        });

        async function mergeConfigEntry(key, value) {
            return Object.assign(configObject[key] || {}, { value: value || (await persistentStore.get(key)) });
        }
        instance.put(opts.prefix + CONFIG_PATH + "/:key", {
            schema: {
                body: {
                    type: "object",
                    properties: {
                        value: {
                            type: ["string"]
                        }
                    },
                    required: ["value"]
                }
            }
        }, async (req, rep) => {
            try {
                const val = req.body.value;
                await setConfigValue(req.params.key, val);
                sendSuccess(rep, `Config ${req.params.key} set to ${val}`);
            } catch (error) {
                sendError(rep, 400, error.message);
            }
        });
        instance.decorate("getConfigValue", getConfigValue);
        instance.decorate("setConfigValue", setConfigValue);

        async function getConfigValue(key, fallback, setFallback) {
            const value = await persistentStore.get(key);
            if (value != null) {
                return value;
            } else {
                if (setFallback) {
                    await setConfigValue(key, fallback);
                }
                return fallback;
            }
        }

        async function setConfigValue(key, value) {
            /*if (!keys.has(key)) {
                throw new Error("Adding new config values during runtime is not allowed.");
            }*/
            if (value == null) {
                throw new Error(`Config value must not be ${value}. Use an empty string instead.`);
            }
            const oldValue = await persistentStore.get(key);
            const newValue = String(configTransformer(key, value));
            if (oldValue !== newValue) {
                await persistentStore.set(key, newValue);
                onChange(key, newValue, oldValue);
                log.debug(`Config ${key} set to ${newValue}.`)
            }
        }

    }
}