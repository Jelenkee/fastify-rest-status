const { sendError, send, convertToAsync, ErrorWithCode } = require("./utils");
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
            const params = req.body.params;
            runAction(req.params.id, params)
                .then(r => send(rep, r == null ? {} : r))
                .catch(e => sendError(rep, e.code || 500, e.message));
        });
        async function runAction(id, params) {
            const action = opts.actions.filter(a => a.id === id)[0];
            if (!action) {
                throw new ErrorWithCode(`No action found for id ${id}`, 404);
            }
            log.debug(`Executing action ${action.id} with params ${JSON.stringify(params)}`);
            let result = null;
            try {
                result = await action.func(params);
            } catch (error) {
                const message = `Error while executing action ${id}: ${error.message}`;
                log.error(message);
                throw new ErrorWithCode(message, 500);
            }
            return result;

        }
        instance.decorate("runAction", runAction);
    }
}