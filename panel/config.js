import { writable } from "svelte/store";
import { doFetch } from "./utils";

const config = writable({});

async function fetchConfig() {
    const res = await (await doFetch(BASE_PATH + "/panel/config")).json();
    config.set(res);
}

export { config, fetchConfig };