import { writable } from "svelte/store";

const toasts = writable({})

function addToast(clazz, text, duration = 5000) {
    const id = String(Math.random() + new Date().getTime());
    toasts.update(o => {
        o[id] = { clazz, text,id };
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