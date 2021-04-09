import { writable } from "svelte/store";

const toasts = writable({})

function addToast(text, level, duration = 5000) {
    if (!level || typeof level !== "string") {
        throw new Error("Invalid level '" + level + "'");
    }
    const id = "_" + String(Math.floor(Math.random() * 1e9) + new Date().getTime());
    toasts.update(o => {
        o[id] = { text, level, id };
        setTimeout(() => {
            toasts.update(o => {
                delete o[id];
                return o;
            });
        }, duration);
        return o;
    });
}

export { toasts, addToast };