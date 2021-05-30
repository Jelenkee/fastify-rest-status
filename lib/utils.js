const path = require("path");
const fs = require("fs/promises");

function sendSuccess(rep, message) {
    send(rep, { success: true, message })
}

function sendError(rep, status, message) {
    send(rep.status(status), { error: message });
}

function send(rep, object) {
    rep.send(object);
}

function convertToAsync(func) {
    if (typeof func !== "function") {
        throw new Error("no function given");
    }
    return async function () {
        return func(...arguments);
    };
}

function errorToObject(error) {
    if (!error) {
        return;
    }
    if (!(error instanceof Error)) {
        throw new Error("Not an error");
    }
    return {
        name: error.name,
        message: error.message,
        stack: error.stack
    };
}

const KEY_REGEX = /^[\w$#.+-]+$/;

async function createFileStore(p) {
    await fs.mkdir(p, { recursive: true });
    const store = {
        async get(key) {
            return fs.readFile(path.join(p, `${key}`)).then(value => value.toString(), () => undefined);
        },
        async set(key, string) {
            if (!KEY_REGEX.test(key)) {
                throw new Error(`Key ${key} does not match ${KEY_REGEX}`);
            }
            return fs.writeFile(path.join(p, `${key}`), string);
        },
        async entries() {
            return Promise.all((await store.keys()).map(async key => [key, (await fs.readFile(path.join(p, `${key}`))).toString()]));
        },
        async keys() {
            return fs.readdir(p);
        }
    }
    return store;
}

async function createStore(object) {
    const persistentStore = object.store || await (async () => {
        const p = object.storePath;
        if (!p) {
            return null;
        } else {
            return createFileStore(p);
        }
    })();
    if (!persistentStore) {
        throw new Error("store or storePath is required");
    }
    //const tmpGet = persistentStore.get, tmpSet = persistentStore.set, tmpEntries = persistentStore.entries;
    return {
        get: convertToAsync(persistentStore.get),
        set: convertToAsync(persistentStore.set),
        entries: convertToAsync(persistentStore.entries),
    }
}

class ErrorWithCode extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

module.exports = { sendSuccess, sendError, send, convertToAsync, errorToObject, createFileStore, createStore, ErrorWithCode };