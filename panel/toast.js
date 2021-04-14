import { writable } from "svelte/store";

const toasts = writable({});

function addToast(text, level, duration = 5000) {
    if (!text) {
        return;
    }
    const id = "_" + Math.floor(Math.random() * 1e4) + new Date().getMilliseconds();
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