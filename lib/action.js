const { sendSuccess, sendError, send, convertToAsync } = require("./utils");
const { ACTION_PATH } = require("./constants.json");

module.exports = async function (log, instance, opts) {
    if (Array.isArray(opts.actions) && opts.actions.length) {
        opts.actions.forEach(action => {
            action.func = convertToAsync(action.func);
            if (!action.id) {
                throw new Error("Action id is missing");
            }
        });
        instance.get(opts.prefix + ACTION_PATH + "/list", (req, rep) => {
            send(rep, opts.actions.map(({ id, name, params }) => ({ id, name: name || id, params: params || [] })));
        });
        instance.post(opts.prefix + ACTION_PATH + "/run/:id", {
            schema: {
                body: {
                    type: "object",
                    properties: {
                        params: {
                            type: "object"
                        }
                    },
                    required: ["params"]
                }
            }
        }, (req, rep) => {
            const action = opts.actions.filter(a => a.id === req.params.id)[0];
            if (!action) {
                const message = `No action found for id ${req.params.id}`;
                log.warn(message);
                sendError(rep, 404, message);
                return;
            }
            const params = req.body.params;
            log.debug(`Executing action ${action.id} with params ${JSON.stringify(params)}`);
            action.func(params)
                .then(r => send(rep, r === undefined ? {} : r))
                .catch(e => {
                    const message = `Error while executing action: ${e.message}`;
                    log.error(message);
                    sendError(rep, 500, message);
                });
        });
    }
}