const Fastify = require("fastify");
const plugin = require("../index");

const fastify = Fastify({ logger: !true });
let num = 0;
let configChanges = 0;
fastify.register(plugin, {
    prefix: "/status",
    logger: true,
    config: {
        defaultConfig: {
            number: 0,
            string: "string",
            array: [],
            json: {}
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
    panel: true
});
fastify.get("*", (req, rep) => {
    rep.type("text/html").send(`<a href="/status/panel">Link to panel</a>`);
});

fastify.listen(3434, (e, a) => {
    e && (() => { throw e })();
    console.log(a);
});