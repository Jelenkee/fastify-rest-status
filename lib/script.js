const { getJSONBody, sendSuccess, sendError, send, convertToAsync } = require("./utils");
const { SCRIPT_PATH } = require("./constants.json");
const LRU = require("tiny-lru");

const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

module.exports = async function (log, instance, opts) {
    const lru = new LRU(100);
    if (opts.script) {
        const store = opts.script.store;
        const list = store ? convertToAsync(store.list) : null;
        const save = store ? convertToAsync(store.save) : null;
        if (save && list) {
            instance.post(opts.prefix + SCRIPT_PATH + "/save", (req, rep) => {
                try {
                    const body = getJSONBody(req);
                    const script = body.script;
                    const name = body.name;
                    if (script && name) {
                        save(name.trim(), script.trim())
                            .then(() => sendSuccess(rep, `Stored script ${name}`))
                            .catch(e => sendError(rep, 500, e.message))
                    } else {
                        sendError(rep, 400, "Missing script and/or name");
                    }
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
        instance.post(opts.prefix + SCRIPT_PATH + "/run", (req, rep) => {
            try {
                const script = getJSONBody(req).script;
                if (script) {
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
                } else {
                    sendError(rep, 400, "Missing script");
                }
            } catch (error) {
                sendError(rep, 400, error.message);
            }
        });
    }
}