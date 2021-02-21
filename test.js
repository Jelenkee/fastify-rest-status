const { test } = require("tap");
const plugin = require("./index");
const pino = require("pino");
const Fastify = require("fastify");
let { LOG_LEVEL_PATH, CONFIG_PATH, ACTION_PATH } = require("./lib/constants.json");

const prefix = "/status";
CONFIG_PATH = prefix + CONFIG_PATH;
LOG_LEVEL_PATH = prefix + LOG_LEVEL_PATH;
ACTION_PATH = prefix + ACTION_PATH;

test("logger", t => {
    t.plan(4);

    t.test("true", async t => {
        t.plan(9);
        const fastify = Fastify({ logger: { level: "debug" } });
        fastify.register(plugin, { prefix, logger: 4 });
        let res = null;

        t.ok(fastify.log.isLevelEnabled("warn"));

        res = await fastify.inject().get(LOG_LEVEL_PATH).end();
        t.equal(res.body, "{\"level\":\"debug\"}");

        res = await fastify.inject().put(LOG_LEVEL_PATH).payload({ level: "error" }).end();
        t.equal(JSON.parse(res.body).success, true);
        t.equal(res.statusCode, 200);
        t.notOk(fastify.log.isLevelEnabled("warn"));

        res = await fastify.inject().put(LOG_LEVEL_PATH + "?level=warn").end();
        t.ok(fastify.log.isLevelEnabled("warn"));

        res = await fastify.inject().put(LOG_LEVEL_PATH).payload({ level: "___" }).end();
        t.ok(JSON.parse(res.body).error)
        t.equal(res.statusCode, 400);
        t.ok(fastify.log.isLevelEnabled("warn"));
    });

    t.test("custom", async t => {
        t.plan(4);
        const fastify = Fastify();
        const customLogger = pino({ level: "trace" });
        fastify.register(plugin, { prefix, logger: customLogger });
        let res = null;

        t.ok(customLogger.isLevelEnabled("debug"));

        res = await fastify.inject().get(LOG_LEVEL_PATH).end();
        t.equal(res.body, "{\"level\":\"trace\"}");

        res = await fastify.inject().put(LOG_LEVEL_PATH).payload({ level: "error" }).end();
        t.equal(JSON.parse(res.body).success, true);
        t.notOk(customLogger.isLevelEnabled("debug"));
    });

    t.test("false", async t => {
        t.plan(1);
        const fastify = Fastify();
        fastify.register(plugin, { prefix });

        const res = await fastify.inject().get(LOG_LEVEL_PATH).end();
        t.equal(res.statusCode, 404);
    });

    t.test("levels", async t => {
        t.plan(1);
        const fastify = Fastify({ logger: true });
        fastify.register(plugin, { prefix, logger: true });

        const res = await fastify.inject().get(LOG_LEVEL_PATH + "/levels").end();
        t.deepEqual(JSON.parse(res.body), ["trace", "debug", "info", "warn", "error", "fatal"]);
    });
});

test("config", t => {
    t.plan(6);
    t.test("defaultConfig", t => {
        t.plan(3);
        const fastify = Fastify();
        fastify.register(plugin, { prefix, config: { defaultConfig: { foo: "foo", bar: 99 } } });
        fastify.get("/", (req, rep) => {
            rep.send(req.getConfigValue("bar"));
        });
        fastify.ready(async () => {
            t.equal(fastify.getConfigValue("foo"), "foo");
            t.equal(fastify.getConfigValue("bar"), 99);

            const res = await fastify.inject().get("/").end();
            t.equal(res.body, "99");
        });
    });

    t.test("transform", t => {
        t.plan(2);
        const fastify = Fastify({ config: {} });
        fastify.register(plugin, {
            prefix,
            config: {
                configTransformer: (key, value) => {
                    if (key === "bar") {
                        return parseInt(value);
                    } else {
                        return value;
                    }
                }
            }
        });

        fastify.ready(() => {
            fastify.setConfigValue("foo", "foo");
            fastify.setConfigValue("bar", "99");

            t.equal(fastify.getConfigValue("foo"), "foo");
            t.equal(fastify.getConfigValue("bar"), 99);
        });
    });

    t.test("nullish", t => {
        t.plan(3);
        const fastify = Fastify();
        fastify.register(plugin, { prefix, config: {} });

        fastify.ready(() => {
            t.equal(fastify.getConfigValue("undef"), undefined);
            fastify.setConfigValue("foo", null);
            fastify.setConfigValue("bar", undefined);
            t.equal(fastify.getConfigValue("foo"), null);
            t.equal(fastify.getConfigValue("bar"), undefined);
        });
    });

    t.test("change event", t => {
        t.plan(1);
        const fastify = Fastify();
        const changes = [];
        fastify.register(plugin, {
            prefix,
            config: {
                onChange: (key, value) => {
                    changes.push(key);
                    changes.push(value);
                }
            }
        });

        fastify.ready(() => {
            fastify.setConfigValue("foo", null);
            fastify.setConfigValue("bar", 99);
            fastify.setConfigValue("bar", "nice");
            fastify.setConfigValue("bar", "nice");
            t.deepEqual(changes, ["foo", null, "bar", 99, "bar", "nice"]);
        });
    });

    t.test("safe & load", t => {
        t.plan(4);
        const fastify = Fastify();
        const store = { c: { foo: 99 } };
        fastify.register(plugin, {
            prefix,
            config: {
                save: obj => store.c = obj,
                load: () => store.c,
                defaultConfig: { bar: "bar", foo: 88 }
            },
        });

        fastify.ready(() => {
            t.equal(fastify.getConfigValue("foo"), 99);
            t.equal(fastify.getConfigValue("bar"), "bar");
            fastify.setConfigValue("foo", 88);
            t.equal(fastify.getConfigValue("foo"), 88);
            t.equal(store.c.foo, 88);
        });
    });

    t.test("routes", async t => {
        t.plan(5);
        const fastify = Fastify();
        fastify.register(plugin, {
            prefix,
            config: {
                defaultConfig: { bar: "bar", foo: 99 }
            },
        });

        let res = null;

        res = await fastify.inject().get(CONFIG_PATH).end();
        t.deepEqual(JSON.parse(res.body), { bar: "bar", foo: 99 });

        res = await fastify.inject().get(CONFIG_PATH + "/bar").end();
        t.deepEqual(JSON.parse(res.body), { bar: "bar" });

        res = await fastify.inject().put(CONFIG_PATH + "/bar").payload({ value: "barbar" }).end();
        res = await fastify.inject().get(CONFIG_PATH + "/bar").end();
        t.deepEqual(JSON.parse(res.body), { bar: "barbar" });

        res = await fastify.inject().put(CONFIG_PATH + "/bar?value=baz").end();
        res = await fastify.inject().get(CONFIG_PATH + "/bar").end();
        t.deepEqual(JSON.parse(res.body), { bar: "baz" });

        res = await fastify.inject().put(CONFIG_PATH + "/foo").payload({ value: "88" }).end();
        res = await fastify.inject().get(CONFIG_PATH).end();
        t.deepEqual(JSON.parse(res.body), { bar: "baz", foo: "88" });
    });
});

test("actions", t => {
    t.plan(3);
    t.test("list", async t => {
        t.plan(1);
        const fastify = Fastify();
        fastify.register(plugin, {
            prefix,
            actions: [
                { id: "foo", name: "FOO", params: ["a", "b"], func: () => { } },
                { id: "bar", func: () => { } },
            ]
        });
        const res = await fastify.inject().get(ACTION_PATH).end();
        t.deepEqual(JSON.parse(res.body), [
            { id: "foo", name: "FOO", params: ["a", "b"] },
            { id: "bar", name: "bar", params: [] },
        ]);
    });

    t.test("error", async t => {
        t.plan(2);
        const fastify = Fastify();
        fastify.register(plugin, {
            prefix,
            actions: [
                { id: "foo", func: () => { throw new Error("ee") } },
            ]
        });
        let res = null;
        res = await fastify.inject().post(ACTION_PATH + "/bar").end();
        t.equal(res.statusCode, 400);
        res = await fastify.inject().post(ACTION_PATH + "/foo").end();
        t.equal(res.statusCode, 500);
    });

    t.test("success", async t => {
        t.plan(4);
        const fastify = Fastify();
        fastify.register(plugin, {
            prefix,
            actions: [
                { id: "nothing", func: () => { } },
                { id: "something", func: params => params },
            ]
        });
        let res = null;
        res = await fastify.inject().post(ACTION_PATH + "/nothing").end();
        t.deepEqual(JSON.parse(res.body), {});
        res = await fastify.inject().post(ACTION_PATH + "/something").end();
        t.deepEqual(JSON.parse(res.body), {});
        res = await fastify.inject().post(ACTION_PATH + "/something?a=a&b=99").end();
        t.deepEqual(JSON.parse(res.body), { a: "a", b: "99" });
        res = await fastify.inject().post(ACTION_PATH + "/something").payload("a=a&b=99").headers({ "content-type": "application/x-www-form-urlencoded" }).end();
        t.deepEqual(JSON.parse(res.body), { a: "a", b: "99" });
    });
});

