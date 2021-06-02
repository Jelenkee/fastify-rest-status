const Fastify = require("fastify");
const plugin = require("../index");

const fastify = Fastify({ logger: true });
fastify.log.level = "warn"
let num = 0;
let configChanges = 0;
const scriptStore = {};
//fastify.addHook("onRoute",console.log);
fastify.addHook("onSend", (_, __, p, n) => {
    setTimeout(() => {
        n(null, p);
    }, 500 - 500);
});
fastify.register(plugin, {
    prefix: "/status",
    logger: true,
    config: {
        defaultConfig: {
            number: {
                value: "one",
                description: "A number",
                values: ["one", "two", "three"]
            },
            string: {
                value: "qwerty",
                description: "A sequence of characters",
                values: ["qwerty", "asdf", "zxcvb"]
            },
            json: {
                value: "",
                description: "empty",
            },
            loglevel: {
                value: fastify.log.level,
                values: Object.values(fastify.log.levels.labels)
            },
            free: {
                value: "FREE",
            }
        },
        configTransformer: (k, v) => {
            if (k === "json") {
                return v + v;
            } else {
                return v;
            }
        },
        onChange: (k, v) => {
            configChanges++;
        },
        storePath: require("path").join(require("os").tmpdir(), "con")
    },
    actions: [
        {
            id: "increment",
            name: "Increment",
            params: ["increment"],
            func: params => {
                let inc;
                if (!params.increment) {
                    inc = 1;
                } else {
                    inc = parseInt(params.increment);
                }
                if (Number.isNaN(inc)) {
                    throw new Error(`${params.increment} is not a number`);
                }
                num += inc;
                if (num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER) {
                    num = 0;
                }
                return num;
            }
        },
        {
            id: "shutdown",
            name: "Shutdown server",
            params: [],
            func: params => {
                process.exit(0);
                return "Of course this does not work in demo ;)";
            }
        }
    ],
    panel: {
        title: "King Hannes",
        logo: "https://upload.wikimedia.org/wikipedia/commons/e/e5/Succs-icon.png",
        metrics: [false && {
            id: "rss",
            name: "RSSbytes",
            chart: {
                steps: 20
            },
            type: ["min", "max", "avg"],
            seconds: 40,
            interval: 5000,
            color: "lightgreen"
        }, {
            id: "freemem",
            name: "Free memory",
            chart: {
                //minY: 0,
                steps: 40,
            },
            seconds: 5,
            interval: 1000,
            color: "plum"
        }]
    },
    script: {
        params: {
            store: ["minus", "times"],
            num: 3,
            this: { fastify: 994 }
        },
        store: {
            list() {
                //return Object.entries(scriptStore).map(e => ({ name: e[0], script: e[1] }));
                return [
                    {
                        name: "FOO",
                        script: "return 'foo'"
                    },
                    {
                        name: "fibonacci",
                        script:
                            `function fibonacci(num) {    
    if(num==1) 
        return 0; 
    if (num == 2) 
        return 1; 
    return fibonacci(num - 1) + fibonacci(num - 2); 
}

return fibonacci(10)`
                    },
                    {
                        name: "banana",
                        script: "return ('b' + 'a' + + 'a' + 'a').toUpperCase()"
                    }
                ]
            },
            save(k, v) {
                scriptStore[k] = v;
            },
            delete(k) {
                delete scriptStore[k];
            }
        }
    },
    env: true,
    monitor: {
        metrics: {
            counter: () => Math.ceil((Math.random() < .5 ? count++ : count--) + Math.random() * 6)
        }
    },
    cron: {
        jobs: [] || [
            {
                task: async () => {
                    const links = [
                        "https://cdnjs.com/",
                        "https://cdnjs.com/about",
                        "https://cdnjs.com/libraries",
                        "https://cdnjs.com/api",
                        "https://opencollective.com/cdnjs?utm_source=cdnjs&utm_medium=cdnjs_link&utm_campaign=cdnjs_footer",
                        "https://status.cdnjs.com/?utm_source=cdnjs&utm_medium=cdnjs_link&utm_campaign=cdnjs_footer",
                        "https://www.cloudflare.com/?utm_source=cdnjs&utm_medium=cdnjs_link&utm_campaign=cdnjs_footer",
                    ];
                    const exec = require("util").promisify(require("child_process").exec)
                    await Promise.all(links.map(l => exec(`curl -I "${l} > /dev/null"`)));
                    return Math.random();
                },
                id: "down",
                schedule: "*/10 * * * * *",
                //schedule: "atra a",
            }
        ],
        storePath: require("path").join("/tmp", "cron")
    },
    auth: false && {
        writeToken: "salmigkeit777"
    }
});
let count = 0;
fastify.get("*", (req, rep) => {
    rep.type("text/html").send(`<a href="/status/panel">Link to panel</a>`);
});

fastify.listen(3434, "0.0.0.0", (e, a) => {
    e && (() => { throw e })();
    console.log(a);
});