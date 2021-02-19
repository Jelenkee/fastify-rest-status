
function getJSONBody(req) {
    return (typeof req.body === "object" ? req.body : JSON.parse(req.body));
}

function sendSuccess(rep, message) {
    send(rep, { success: true, message })
}

function sendError(rep, status, message) {
    send(rep.status(status), { error: message });
}

function send(rep, object) {
    rep.send(object);
}

function getFormBody(req) {
    return Object.assign({}, req.query, typeof req.body === "object" ? req.body : {});
}

function convertToAsync(func) {
    if (typeof func !== "function") {
        throw new Error("no function given");
    }
    return async function (object) {
        return func(object);
    };
}

module.exports = { getJSONBody, getFormBody, sendSuccess, sendError, send, convertToAsync };