const { test } = require("tap");
const plugin = require("./index");
const Fastify = require("fastify");
const path = require("path");
const rimraf = require("rimraf");
let { CONFIG_PATH, ACTION_PATH, SCRIPT_PATH, MONITOR_PATH, CRON_PATH } = require("./lib/constants.json");

const prefix = "/status";
CONFIG_PATH = prefix + CONFIG_PATH;
ACTION_PATH = prefix + ACTION_PATH;
SCRIPT_PATH = prefix + SCRIPT_PATH;
MONITOR_PATH = prefix + MONITOR_PATH;
CRON_PATH = prefix + CRON_PATH;

test("config", t => {
    t.plan(6);
    t.test("defaultConfig", t => {
        t.plan(3);
        const fastify = Fastify();
        fastify.register(plugin, { prefix, config: { defaultConfig: { foo: { value: "foo" }, bar: { value: 99 } } } });
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
        const fastify = Fastify();
        fastify.register(plugin, {
            prefix,
            config: {
                configTransformer: (key, value) => {
                    if (key === "bar") {
                        return parseInt(value);
                    } else {
                        return value;
                    }
                },
                defaultConfig: { foo: { value: "" }, bar: { value: "" } }
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
        fastify.register(plugin, {
            prefix, config: {
                defaultConfig: {
                    undef: { value: undefined },
                    foo: { value: undefined },
                    bar: { value: undefined },
                }
            }
        });

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
                },
                defaultConfig: {
                    foo: { value: undefined },
                    bar: { value: undefined },
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
        const store = { c: { foo: { value: 99 } } };
        fastify.register(plugin, {
            prefix,
            config: {
                save: obj => store.c = obj,
                load: () => store.c,
                defaultConfig: { bar: { value: "bar" }, foo: { value: 88 } }
            },
        });

        fastify.ready(() => {
            t.equal(fastify.getConfigValue("foo"), 99);
            t.equal(fastify.getConfigValue("bar"), "bar");
            fastify.setConfigValue("foo", 88);
            t.equal(fastify.getConfigValue("foo"), 88);
            t.equal(store.c.foo.value, 88);
        });
    });

    t.test("routes", async t => {
        t.plan(5);
        const fastify = Fastify();
        fastify.register(plugin, {
            prefix,
            config: {
                defaultConfig: { bar: { value: "bar" }, foo: { value: 99 } }
            },
        });

        let res = null;

        res = await fastify.inject().get(CONFIG_PATH).end();
        t.deepEqual(JSON.parse(res.body), { bar: { value: "bar" }, foo: { value: 99 } });

        res = await fastify.inject().get(CONFIG_PATH + "/bar").end();
        t.deepEqual(JSON.parse(res.body), { value: "bar" });

        res = await fastify.inject().put(CONFIG_PATH + "/bar").payload({ value: "barbar" }).end();
        res = await fastify.inject().get(CONFIG_PATH + "/bar").end();
        t.deepEqual(JSON.parse(res.body), { value: "barbar" });

        res = await fastify.inject().put(CONFIG_PATH + "/bar").payload({ value: "baz" }).end();
        res = await fastify.inject().get(CONFIG_PATH + "/bar").end();
        t.deepEqual(JSON.parse(res.body), { value: "baz" });

        res = await fastify.inject().put(CONFIG_PATH + "/foo").payload({ value: "88" }).end();
        res = await fastify.inject().get(CONFIG_PATH).end();
        t.deepEqual(JSON.parse(res.body), { bar: { value: "baz" }, foo: { value: "88" } });
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
        const res = await fastify.inject().get(ACTION_PATH + "/list").end();
        t.deepEqual(JSON.parse(res.body), [
            { id: "foo", name: "FOO", params: ["a", "b"] },
            { id: "bar", name: "bar", params: [] },
        ]);
    });

    t.test("error", async t => {
        t.plan(4);
        const fastify = Fastify();
        fastify.register(plugin, {
            prefix,
            actions: [
                { id: "foo", func: () => { throw new Error("ee") } },
            ]
        });
        let res = null;
        res = await fastify.inject().post(ACTION_PATH + "/run/bar").payload({ params: {} }).end();
        t.equal(res.statusCode, 404);
        res = await fastify.inject().post(ACTION_PATH + "/run/foo").end();
        t.equal(res.statusCode, 400);
        res = await fastify.inject().post(ACTION_PATH + "/run/foo").payload({ params: {} }).end();
        t.equal(res.statusCode, 500);
        t.rejects(fastify.runAction("foo"));
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
        res = await fastify.inject().post(ACTION_PATH + "/run/nothing").payload({ params: {} }).end();
        t.deepEqual(JSON.parse(res.body), {});
        res = await fastify.inject().post(ACTION_PATH + "/run/something").payload({ params: {} }).end();
        t.deepEqual(JSON.parse(res.body), {});
        res = await fastify.inject().post(ACTION_PATH + "/run/something").payload({ params: { a: "a", b: "99" } }).end();
        t.deepEqual(JSON.parse(res.body), { a: "a", b: "99" });
        t.equal((await fastify.runAction("something", { foo: true })).foo, true);
    });
});

test("script", t => {
    t.plan(3);
    t.test("sync/async", async t => {
        t.plan(6);
        const fastify = Fastify();
        fastify.register(plugin, {
            prefix,
            script: true
        });
        let res = null;

        res = await fastify.inject().post(SCRIPT_PATH + "/run").payload({ script: "let k=9;k+=9;" }).end();
        t.equal(JSON.parse(res.body).result, undefined);
        res = await fastify.inject().post(SCRIPT_PATH + "/run").payload({ script: "let k=9;k+=9;return k" }).end();
        t.equal(JSON.parse(res.body).result, 18);
        res = await fastify.inject().post(SCRIPT_PATH + "/run").payload({ script: "let k=9;k+=9;return Promise.resolve(k)" }).end();
        t.equal(JSON.parse(res.body).result, 18);
        res = await fastify.inject().post(SCRIPT_PATH + "/run").payload({ script: "let k=9;k+=9;return await k" }).end();
        t.equal(JSON.parse(res.body).result, 18);
        t.ok(JSON.parse(res.body).executionTime >= 0);
        res = await fastify.inject().post(SCRIPT_PATH + "/run").payload({}).end();
        t.equal(res.statusCode, 400);

    });

    t.test("params", async t => {
        t.plan(8);
        const fastify = Fastify();
        fastify.register(plugin, {
            prefix,
            script: {
                params: {
                    this: { foo: "bar" },
                    foo: 321
                }
            }
        });
        let res = null;

        res = await fastify.inject().post(SCRIPT_PATH + "/run").payload({ script: "return this.foo" }).end();
        t.equal(JSON.parse(res.body).result, "bar");
        res = await fastify.inject().post(SCRIPT_PATH + "/run").payload({ script: "return foo" }).end();
        t.equal(JSON.parse(res.body).result, 321);
        t.equal(res.statusCode, 200);
        t.notOk(JSON.parse(res.body).error);
        res = await fastify.inject().post(SCRIPT_PATH + "/run").payload({ script: "return bar" }).end();
        t.equal(res.statusCode, 400);
        t.ok(JSON.parse(res.body).error.message);
        t.ok(JSON.parse(res.body).error.name);
        res = await fastify.inject().post(SCRIPT_PATH + "/run").payload({ script: "console.info('foo');console.error('bar');console.log('baz')" }).end();
        const { EOL } = require("os");
        t.equal(JSON.parse(res.body).output, `foo${EOL}bar${EOL}baz${EOL}`)

    });

    t.test("store", async t => {
        t.plan(9);
        const fastify = Fastify();
        const store = {};
        fastify.register(plugin, {
            prefix,
            script: {
                store: {
                    list() {
                        return Object.entries(store).map(e => ({ name: e[0], script: e[1] }));
                    },
                    save(k, v) {
                        store[k] = v;
                    },
                    delete(k) {
                        delete store[k];
                    }
                }
            }
        });
        let res = null;

        res = await fastify.inject().post(SCRIPT_PATH + "/save").payload({ script: "return 'foo'", name: "foo" }).end();
        t.equal(res.statusCode, 200);
        res = await fastify.inject().post(SCRIPT_PATH + "/save").payload({ script: "return 'bar'", name: "bar" }).end();
        t.equal(res.statusCode, 200);
        res = await fastify.inject().post(SCRIPT_PATH + "/save").payload({ script: "return 'anything'" }).end();
        t.equal(res.statusCode, 400);
        res = await fastify.inject().get(SCRIPT_PATH + "/list").end();
        t.equal(JSON.parse(res.body).length, 2);
        t.ok(["foo", "bar"].includes(JSON.parse(res.body)[0].name));
        t.ok(["foo", "bar"].includes(JSON.parse(res.body)[1].name));
        t.equal(res.statusCode, 200);
        res = await fastify.inject().delete(SCRIPT_PATH + "/delete/foo").end();
        t.equal(res.statusCode, 200);
        res = await fastify.inject().get(SCRIPT_PATH + "/list").end();
        t.equal(JSON.parse(res.body).length, 1);

    });
});

test("monitor", t => {
    t.plan(2);
    t.test("default", async t => {
        t.plan(9);
        const fastify = Fastify();
        fastify.register(plugin, {
            prefix,
            monitor: true
        });
        let res = null;

        res = await fastify.inject().get(MONITOR_PATH + "/loadavg").end();
        t.ok(JSON.parse(res.body) < 10);
        res = await fastify.inject().get(MONITOR_PATH + "/loadavg/8").end();
        t.ok(JSON.parse(res.body).avg < 10);
        t.ok(JSON.parse(res.body).min < 10);
        t.ok(JSON.parse(res.body).max < 10);
        res = await fastify.inject().get(MONITOR_PATH + "/loadavg/__").end();
        t.equal(res.statusCode, 400);
        res = await fastify.inject().get(MONITOR_PATH + "/rss").end();
        t.equal(res.statusCode, 200);
        res = await fastify.inject().get(MONITOR_PATH + "/heapUsed").end();
        t.equal(res.statusCode, 200);
        res = await fastify.inject().get(MONITOR_PATH + "/heapTotal/0").end();
        t.equal(res.statusCode, 200);
        res = await fastify.inject().get(MONITOR_PATH + "/freemem").end();
        t.equal(res.statusCode, 200);

    });

    t.test("interval", async t => {
        t.plan(7);
        const fastify = Fastify();
        let count = 0;
        fastify.register(plugin, {
            prefix,
            monitor: {
                interval: 50,
                metrics: {
                    custom: () => count++
                }
            }
        });
        let res = null;

        res = await fastify.inject().get(MONITOR_PATH + "/custom/100").end();
        t.equal(JSON.parse(res.body).avg, 0);
        await wait(2100)
        res = await fastify.inject().get(MONITOR_PATH + "/custom/100").end();
        t.ok(JSON.parse(res.body).avg > 7);
        res = await fastify.inject().get(MONITOR_PATH + "/custom/1").end();
        const one = JSON.parse(res.body);
        res = await fastify.inject().get(MONITOR_PATH + "/custom/100").end();
        const multiple = JSON.parse(res.body);
        t.ok(one.avg > multiple.avg);
        t.ok(one.max >= one.avg);
        t.ok(one.min <= one.avg);
        t.ok(fastify.getMetric("rss") > 1);
        t.ok(fastify.getMetric("rss", 9).min > 1);

    });

});

test("cron", t => {
    t.plan(6)

    t.test("storePath", async t => {
        t.plan(5);
        const fastify = Fastify();
        const storePath = path.join(process.cwd(), "izi");
        fastify.register(plugin, {
            prefix,
            cron: {
                storePath,
                jobs: [
                    { id: "placebo", schedule: "* * * * * *", task: console.log },
                    { id: "placebo2", schedule: "* * 4 * * *", task: console.log },
                ]
            },
        });
        let res = null;

        res = await fastify.inject().get(CRON_PATH + "/job/foo").end();
        t.equal(res.statusCode, 404);
        res = await fastify.inject().get(CRON_PATH + "/job/placebo").end();
        t.equal(JSON.parse(res.body).id, "placebo");
        t.equal(JSON.parse(res.body).active, false);

        res = await fastify.inject().get(CRON_PATH + "/list").end();
        const list = JSON.parse(res.body).map(j => j.id);
        t.ok(list.includes("placebo"))
        t.ok(list.includes("placebo2"))

        removeStoreFolder(storePath);

    });

    t.test("store", async t => {
        t.plan(7);
        const fastify = Fastify();
        const store = {};
        fastify.register(plugin, {
            prefix,
            cron: {
                store: {
                    get(id) { return store[id]; },
                    set(id, job) { store[id] = job; },
                    list() { return Object.values(store); },
                },
                jobs: [
                    { id: "placebo", schedule: "* * * * * *", task: console.log }
                ]
            },
        });
        let res = null;

        res = await fastify.inject().get(CRON_PATH + "/job/foo").end();
        t.equal(res.statusCode, 404);
        res = await fastify.inject().get(CRON_PATH + "/job/placebo").end();
        t.equal(JSON.parse(res.body).id, "placebo");
        t.equal(JSON.parse(res.body).history.length, 0);
        res = await fastify.inject().post(CRON_PATH + "/enable/placebo").end();
        t.equal(res.statusCode, 200);
        res = await fastify.inject().get(CRON_PATH + "/job/placebo").end();
        t.equal(JSON.parse(res.body).active, true);
        res = await fastify.inject().post(CRON_PATH + "/disable/placebo").end();
        t.equal(res.statusCode, 200);
        res = await fastify.inject().get(CRON_PATH + "/job/placebo").end();
        t.equal(JSON.parse(res.body).active, false);
    });

    t.test("run", async t => {
        t.plan(6);
        const fastify = Fastify();
        const store = {};
        let count = 0;
        fastify.register(plugin, {
            prefix,
            cron: {
                store: {
                    get(id) { return store[id]; },
                    set(id, job) { store[id] = job; },
                    list() { return Object.values(store); },
                },
                jobs: [
                    { id: "placebo", schedule: "* * * 31 2 *", task: () => count++ }
                ]
            },
        });
        let res = null;

        res = await fastify.inject().post(CRON_PATH + "/run/foo").end();
        t.equal(res.statusCode, 404);
        res = await fastify.inject().post(CRON_PATH + "/run/placebo").end();
        t.equal(res.statusCode, 400);

        res = await fastify.inject().post(CRON_PATH + "/enable/placebo").end();
        t.equal(res.statusCode, 200);
        res = await fastify.inject().post(CRON_PATH + "/run/placebo").end();
        t.equal(res.statusCode, 200);
        res = await fastify.inject().post(CRON_PATH + "/disable/placebo").end();
        t.equal(res.statusCode, 200);
        t.equal(count, 1);
    });

    t.test("schedule", async t => {
        t.plan(4);
        const fastify = Fastify();
        const store = {};
        let count = 0;
        fastify.register(plugin, {
            prefix,
            cron: {
                store: {
                    get(id) { return store[id]; },
                    set(id, job) { store[id] = job; },
                    list() { return Object.values(store); },
                },
                jobs: [
                    { id: "placebo", schedule: "* * * 31 2 *", task: () => count++ }
                ]
            },
        });
        let res = null;

        res = await fastify.inject().get(CRON_PATH + "/job/placebo").end();
        t.equal(JSON.parse(res.body).schedule, "* * * 31 2 *");

        res = await fastify.inject().post(CRON_PATH + "/schedule/placebo").payload({ schedule: "* * * 31 4 *" }).end();
        t.equal(res.statusCode, 200);

        res = await fastify.inject().get(CRON_PATH + "/job/placebo").end();
        t.equal(JSON.parse(res.body).schedule, "* * * 31 4 *");

        res = await fastify.inject().post(CRON_PATH + "/schedule/placebo").payload({ schedule: "rarararrarar" }).end();
        t.equal(res.statusCode, 400);
    });

    t.test("history", async t => {
        t.plan(12);
        const fastify = Fastify();
        const store = {};
        let count = 0;
        fastify.register(plugin, {
            prefix,
            cron: {
                store: {
                    get(id) { return store[id]; },
                    set(id, job) { store[id] = job; },
                    list() { return Object.values(store); },
                },
                jobs: [
                    {
                        id: "placebo", schedule: "* * * 31 2 *", task: () => {
                            if (count >= 2) {
                                throw new Error("E");
                            }
                            return ++count;
                        }
                    }
                ]
            },
        });
        let res = null;

        res = await fastify.inject().post(CRON_PATH + "/enable/placebo").end();
        t.equal(res.statusCode, 200);

        res = await fastify.inject().post(CRON_PATH + "/run/placebo").end();
        t.equal(res.statusCode, 200);
        await wait(100)
        res = await fastify.inject().post(CRON_PATH + "/run/placebo").end();
        t.equal(res.statusCode, 200);
        await wait(100)
        res = await fastify.inject().post(CRON_PATH + "/run/placebo").end();
        t.equal(res.statusCode, 200);

        res = await fastify.inject().get(CRON_PATH + "/job/placebo").end();
        const history = JSON.parse(res.body).history;
        t.equal(history.length, 3);
        t.equal(history[0].result2, "1");
        t.equal(history[0].result, "SUCCESS");
        t.ok(history[0].duration >= 0);
        t.equal(history[1].result2, "2");
        t.equal(history[2].result, "ERROR");
        t.equal(history[2].error.message, "E");

        res = await fastify.inject().post(CRON_PATH + "/disable/placebo").end();
        t.equal(res.statusCode, 200);

    });

    t.test("decorators", async t => {
        t.plan(6);
        const fastify = Fastify();
        const PLACEBO = "placebo";
        const store = {};
        let count = 0;
        fastify.register(plugin, {
            prefix,
            cron: {
                store: {
                    get(id) { return store[id]; },
                    set(id, job) { store[id] = job; },
                    list() { return Object.values(store); },
                },
                jobs: [
                    { id: PLACEBO, schedule: "* * * 31 2 *", task: () => count++ }
                ]
            },
        });
        let job;

        await fastify.ready();
        job = await fastify.getCronjob(PLACEBO);
        t.equal(job.active, false);
        await fastify.enableCronjob(PLACEBO);
        job = await fastify.getCronjob(PLACEBO);
        t.equal(job.active, true);
        t.equal((await fastify.getCronjobList())[0].id, PLACEBO);
        await fastify.runCronjob(PLACEBO);
        t.equal(count, 1);
        await fastify.scheduleJob(PLACEBO, "* * * 31 4 *");
        await fastify.disableCronjob(PLACEBO);
        job = await fastify.getCronjob(PLACEBO);
        t.equal(job.active, false);
        t.equal(job.schedule, "* * * 31 4 *");
    });

    function removeStoreFolder(p) {
        rimraf(p, () => { });
    }

});

test("auth", t => {
    t.plan(0); return;
    t.plan(1);
    t.test("api only", async t => {
        t.plan(3);
        const fastify = Fastify();
        const token = "ABCEFGHRIJDACASE";
        fastify.register(plugin, {
            prefix,
            monitor: true,
            auth: { writeToken: token }
        });
        fastify.get("/foo", (req, rep) => rep.send("foo"));
        let res = null;

        res = await fastify.inject().get(MONITOR_PATH + "/rss").end();
        t.equal(res.statusCode, 401);

        res = await fastify.inject().get("/foo").end();
        t.equal(res.statusCode, 200);
        t.equal(res.body, "foo");

    });
});

async function wait(ms) {
    return new Promise((res, rej) => {
        setTimeout(() => {
            res();
        }, ms);
    });
}
