import { writable } from "svelte/store";
import { addToast } from "./toast"

const KEY_DARK = "dark";

const darkMode = writable(Boolean(localStorage.getItem(KEY_DARK)));
darkMode.subscribe(value => localStorage.setItem(KEY_DARK, value ? 1 : ""));

async function doFetch(path, options) {
    return fetch(path, options)
        .then(async res => {
            if (!res.ok) {
                const json = await res.json();
                throw new Error(json.error || json.message || res.statusText);
            }
            return res;
        })
        .catch(e => {
            addToast(e.message, "danger");
            throw e;
        });
}

export { doFetch, darkMode };