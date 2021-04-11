import { addToast } from "./toast"

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

export { doFetch };