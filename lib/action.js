const { getFormBody, sendSuccess, sendError, send, convertToAsync } = require("./utils");
const { ACTION_PATH } = require("./constants.json");

module.exports = async function (log, instance, opts) {
    if (Array.isArray(opts.actions) && opts.actions.length) {
        opts.actions.forEach(action => {
            action.func = convertToAsync(action.func);
            if (!action.id) {
                throw new Error("action id is missing");
            }
        });
        instance.get(opts.prefix + ACTION_PATH, (req, rep) => {
            send(rep, opts.actions.map(({ id, name, params }) => ({ id, name: name || id, params: params || [] })));
        });
        instance.post(opts.prefix + ACTION_PATH + "/:id", (req, rep) => {
            const action = opts.actions.filter(a => a.id === req.params.id)[0];
            if (!action) {
                const message = `No action found for id ${req.params.id}`;
                log.warn(message);
                sendError(rep, 400, message);
                return;
            }
            const params = getFormBody(req);
            log.debug(`Executing action ${action.id} with params ${JSON.stringify(params)}`);
            action.func(params)
                .then(r => r === undefined ? send(rep, {}) : send(rep, r))
                .catch(e => {
                    const message = `Error while executing action: ${e.message}`;
                    log.error(message);
                    sendError(rep, 500, message);
                });
        });
    }
}