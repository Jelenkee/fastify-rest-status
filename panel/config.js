import { writable } from "svelte/store";
import { doFetch } from "./utils";

const config = writable({});
let loaded = false;
const loadingFunctions = [];

async function fetchConfig() {
    const res = await (await doFetch(BASE_PATH + "/panel/config")).json();
    config.set(res);
    loaded = true;
    loadingFunctions.forEach(func => func());
}

function afterLoaded(func) {
    if (loaded) {
        func();
    } else {
        loadingFunctions.push(func);
    }
}

export { config, fetchConfig, afterLoaded };