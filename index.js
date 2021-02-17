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
    promises.push(require("./lib/loglevel")(log, instance, opts));
    promises.push(require("./lib/config")(log, instance, opts));
    //TOODO actions (trigger from gui with params), async/sync
    //TODO get systemdata require("os")
    //TODO custom healthcheck
    //TODO process.env
    //TODO node-server settings (port, etc)
    //TODO show routes

    instance.addContentTypeParser('*', { parseAs: "string" }, function (request, payload, done) {
        done(null, payload)
    });

    Promise.all(promises).then(() => done()).catch(e => done(e));
}

module.exports = fp(plugin, {
    fastify: ">=3.x.x",
    name: NAME,
});

console.log(__filename);
/*const f=require("fastify")({logger:true});
//f.register(module.exports,{logger:true,config:true});
f.get("/a//b",(req,rep)=>rep.send("party"));
f.listen(3434,(e,a)=>{
    e&&console.log(e);
    console.log(a);
    //f.getConfigValue("d");
});*/
