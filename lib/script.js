const { getJSONBody, sendSuccess, sendError, send, convertToAsync } = require("./utils");
const { SCRIPT_PATH } = require("./constants.json");
const LRU = require("tiny-lru");

const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

module.exports = async function (log, instance, opts) {
    const lru = new LRU(100);
    if (opts.script && opts.script.that) {
        const store = opts.script.store;
        const get = store ? convertToAsync(store.get) : null;
        const getAll = store ? convertToAsync(store.getAll) : null;
        const set = store ? convertToAsync(store.set) : null;
        if (get && set && getAll) {
            instance.post(opts.prefix + SCRIPT_PATH + "/save", (req, rep) => {
                try {
                    const body = getJSONBody(req);
                    const script = body.script;
                    const name = body.name;
                    if (script && name) {
                        set(name, script)
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
                getAll()
                    .then(r => send(rep, r))
                    .catch(e => sendError(rep, 500, e.message))
            });
        }
        const params = Object.entries(opts.script.params) || [];
        instance.post(opts.prefix + SCRIPT_PATH + "/run", (req, rep) => {
            try {
                const script = getJSONBody(req).script;
                if (script) {
                    let func = lru.get(script);
                    if (!func) {
                        const args = [...params.map(e => e[0]), script];
                        try {
                            func = new Function(...args);
                        } catch (error) {
                            func = new AsyncFunction(...args);
                        }
                        lru.set(script, func);
                    }
                    const time = new Date().getTime();
                    const result = func.apply(opts.script.that, params.map(e => e[1]));
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