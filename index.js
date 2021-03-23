const fp = require("fastify-plugin");

const NAME = "fastify-rest-status";

function plugin(instance, opts, done) {
    opts = Object.assign({}, opts);
    if (!opts.prefix) {
        done(new Error("prefix is required"));
        return;
    }
    const loggerOptions = { name: NAME };
    if (typeof opts.logLevel === "string") {
        loggerOptions.level = opts.logLevel;
    }
    const log = instance.log.child(loggerOptions);
    const promises = [];
    promises.push(require("./lib/config")(log, instance, opts));
    promises.push(require("./lib/action")(log, instance, opts));
    promises.push(require("./lib/script")(log, instance, opts));
    promises.push(require("./lib/panel")(log, instance, opts));
    promises.push(require("./lib/env")(log, instance, opts));
    promises.push(require("./lib/monitor")(log, instance, opts));
    promises.push(require("./lib/cron")(log, instance, opts));

    //TODO custom healthcheck
    //TODO node-server settings (port, etc)
    //TODO cronjobs
    //TODO add logging
    //TODO decorators

    /*instance.addContentTypeParser('*', { parseAs: "string" }, function (request, payload, done) {
        done(null, payload)
    });
    instance.register(require("fastify-formbody"));*/

    Promise.all(promises).then(() => done()).catch(e => done(e));
}

module.exports = fp(plugin, {
    fastify: ">=3.x.x",
    name: NAME,
});
