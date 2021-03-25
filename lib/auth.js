
module.exports = async function (log, instance, opts) {
    if (opts.auth) {
        const header = (opts.auth.header || "X-Auth-Token").toLowerCase();
        const writeToken = opts.auth.writeToken;
        if (!writeToken) {
            throw new Error("writeToken is missing.");
        }
        const readToken = opts.auth.readToken || "";
        validateTokenSecurity(writeToken);
        validateTokenSecurity(readToken);
        instance.addHook("onRequest", (req, rep, done) => {
            const token = req.headers[header];
            if (!validateToken(token, req.method)) {
                rep.status(401).send({ error: "Unauthorized" });
            }
            done();
        });
        instance.decorate("sa","lack");

        function validateToken(token, method) {
            if (!token) {
                return false;
            }
            if (method === "GET") {
                if ((readToken && readToken === token) || writeToken === token) {
                    return true;
                }
            } else {
                if (writeToken === token) {
                    return true;
                }
            }
            return false;
        }
    }
}

function validateTokenSecurity(token) {
    if (token.length > 0 && token.length < 12) {
        throw new Error("token is too short");
    }
}