const { sendSuccess, sendError, send, convertToAsync } = require("./utils");
const { SCRIPT_PATH } = require("./constants.json");
const LRU = require("tiny-lru");

const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

module.exports = async function (log, instance, opts) {
    const lru = new LRU(100);
    if (opts.script) {
        const store = opts.script.store;
        const list = store ? convertToAsync(store.list) : null;
        const save = store ? convertToAsync(store.save) : null;
        //TODO delete
        if (save && list) {
            instance.post(opts.prefix + SCRIPT_PATH + "/save", {
                schema: {
                    body: {
                        type: "object",
                        properties: {
                            script: {
                                type: "string",
                                minLength: 1
                            },
                            name: {
                                type: "string",
                                minLength: 1
                            }
                        },
                        required: ["script", "name"]
                    }
                }
            }, (req, rep) => {
                try {
                    const script = req.body.script;
                    const name = req.body.name;
                    save(name.trim(), script.trim())
                        .then(() => sendSuccess(rep, `Stored script ${name}`))
                        .catch(e => sendError(rep, 500, e.message))
                } catch (error) {
                    sendError(rep, 400, error.message);
                }
            });
            instance.get(opts.prefix + SCRIPT_PATH + "/list", (req, rep) => {
                list()
                    .then(r => r.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())))
                    .then(r => send(rep, r))
                    .catch(e => sendError(rep, 500, e.message))
            });
        }
        const paramEntriesWithoutThis = (Object.entries(opts.script.params || {})).filter(e => e[0] !== "this");
        instance.post(opts.prefix + SCRIPT_PATH + "/run", {
            schema: {
                body: {
                    type: "object",
                    properties: {
                        script: {
                            type: "string",
                            minLength: 1
                        }
                    },
                    required: ["script"]
                }
            }
        }, (req, rep) => {
            try {
                const script = req.body.script;
                let func = lru.get(script);
                if (!func) {
                    const args = [...paramEntriesWithoutThis.map(e => e[0]), script];
                    try {
                        func = new Function(...args);
                    } catch (error) {
                        func = new AsyncFunction(...args);
                    }
                    lru.set(script, func);
                }
                const time = new Date().getTime();
                const result = func.apply((opts.script.params || {}).this, paramEntriesWithoutThis.map(e => e[1]));
                if (result instanceof Promise) {
                    result
                        .then(result => send(rep, { result, executionTime: new Date().getTime() - time }))
                        .catch(error => sendError(rep, 400, error.message))
                } else {
                    send(rep, { result, executionTime: new Date().getTime() - time });
                }
            } catch (error) {
                sendError(rep, 400, error.message);
            }
        });
    }
}