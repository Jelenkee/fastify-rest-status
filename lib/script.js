const { sendSuccess, sendError, send, convertToAsync, errorToObject } = require("./utils");
const { SCRIPT_PATH } = require("./constants.json");
const LRU = require("tiny-lru");
const { Stream } = require("stream");

const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

module.exports = async function (log, instance, opts) {
    const lru = new LRU(100);
    if (opts.script) {
        const store = opts.script.store;
        const list = store ? convertToAsync(store.list) : null;
        const save = store ? convertToAsync(store.save) : null;
        const delet = store ? convertToAsync(store.delete) : null;
        if (save && list && delet) {
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
                const script = req.body.script;
                const name = req.body.name;
                save(name.trim(), script.trim())
                    .then(() => sendSuccess(rep, `Stored script ${name}`))
                    .catch(e => sendError(rep, 500, e.message))
            });
            instance.delete(opts.prefix + SCRIPT_PATH + "/delete/:name", (req, rep) => {
                const name = req.params.name;
                delet(name.trim())
                    .then(() => sendSuccess(rep, `Removed script ${name}`))
                    .catch(e => sendError(rep, 500, e.message))
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
            const script = req.body.script;
            let func = lru.get(script);
            const consoleObject = createConsole();
            const finalParams = [...paramEntriesWithoutThis, ["console", consoleObject.console]];
            const time = new Date().getTime();
            if (!func) {
                const args = [...finalParams.map(e => e[0]), script];
                try {
                    func = new AsyncFunction(...args);
                } catch (error) {
                    return send(rep, createResult(null, error));
                }
                lru.set(script, func);
            }
            try {
                const result = func.apply((opts.script.params || {}).this, finalParams.map(e => e[1]));
                result
                    .then(result => send(rep, createResult(result)))
                    .catch(error => send(rep, createResult(null, error)))
            } catch (error) {
                send(rep, createResult(null, error));
            }
            function createResult(result, error) {
                consoleObject.finish();
                if (error) {
                    rep.status(400);
                }
                return {
                    result,
                    error: errorToObject(error),
                    executionTime: new Date().getTime() - time,
                    output: consoleObject.getOutput()
                };
            }
        });
    }
}

function createConsole() {
    const stdOut = new Stream.Writable();
    let output = "";
    stdOut._write = (chunk, encoding, next) => {
        output += chunk.toString();
        next();
    };
    return {
        console: new console.Console(stdOut, stdOut),
        getOutput() {
            return output;
        },
        finish() {
            stdOut.destroy();
        }
    }
}