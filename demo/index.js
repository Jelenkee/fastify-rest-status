const Fastify = require("fastify");
const plugin = require("../index");

const fastify = Fastify({ logger: true });
fastify.log.level = "warn"
let num = 0;
let configChanges = 0;
const scriptStore = {};
//fastify.addHook("onRoute",console.log);
fastify.register(plugin, {
    prefix: "/status",
    logger: true,
    config: {
        defaultConfig: {
            number: {
                value: 0,
                description: "A number",
                values: []
            },
            string: {
                value: "qwerty",
                description: "A sequence of characters",
                values: ["qwerty", "asdf", "zxcvb"]
            },
            array: {
                value: ["malee"],
                values: [["1", "2", "3"], ["a", "b", "c"]]
            },
            json: {
                value: {},
                description: "An object",
            },
            loglevel: {
                value: fastify.log.level,
                values: Object.values(fastify.log.levels.labels)
            }
        },
        configTransformer: (k, v) => {
            if (k === "number") {
                const neu = parseInt(v);
                if (Number.isNaN(neu)) {
                    throw new Error(`${v} is not a number.`);
                }
                return neu;
            } else if (k === "array") {
                return v.split(",").map(s => s.trim());
            } else if (k === "json") {
                return JSON.parse(k);
            } else {
                return v;
            }
        },
        onChange: (k, v) => {
            configChanges++;
        }
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
                return "Of course this does not work in demo ;)";
            }
        }
    ],
    panel: true,
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
                //scriptStore[k] = v;
            },
            delete(k) { }
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
        storePath: require("path").join(process.cwd(), "killing")
    },
    auth: false && {
        writeToken: "salmigkeit777"
    }
});
let count = 0;
fastify.get("*", (req, rep) => {
    rep.type("text/html").send(`<a href="/status/panel">Link to panel</a>`);
});

fastify.listen(3434, (e, a) => {
    e && (() => { throw e })();
    console.log(a);
});