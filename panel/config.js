import { writable } from "svelte/store";
import { doFetch } from "./utils";

let config = {};
const configStore = writable({});
configStore.subscribe(value => config = value);
let loaded = false;
const loadingFunctions = [];

async function fetchConfig() {
    const res = await (await doFetch(BASE_PATH + "/panel/config")).json();
    configStore.set(res);
    loaded = true;
    loadingFunctions.forEach(func => func(res));
}

function afterLoaded(func) {
    if (loaded) {
        func(config);
    } else {
        loadingFunctions.push(func);
    }
}

export { configStore as config, fetchConfig, afterLoaded };