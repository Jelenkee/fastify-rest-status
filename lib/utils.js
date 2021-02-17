function getBody(req) {
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

module.exports = { getBody, sendSuccess, sendError, send };