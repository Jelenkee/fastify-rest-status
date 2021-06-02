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

function getColorArray(color, array = []) {
    try {
        document.head.style.backgroundColor = color;
        let rgb = window.getComputedStyle(document.head).backgroundColor;
        rgb = rgb.slice(rgb.indexOf("(") + 1, rgb.indexOf(")"));
        rgb = rgb.split(",").map(s => Number(s.trim()));
        if (rgb.length < 3) { throw new Error(String(rgb)); }
        const hsl = RGBToHSL(rgb[0], rgb[1], rgb[2]);
        return array.map(c => `hsl(${hsl[0]},${hsl[1]}%,${c}%)`);
    } catch (error) {
        console.error(error);
        return array.map(c => `hsl(0,0%,${c}%)`);
    }
}

// https://www.30secondsofcode.org/js/s/rgb-to-hsl
function RGBToHSL(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const l = Math.max(r, g, b);
    const s = l - Math.min(r, g, b);
    const h = s
        ? l === r
            ? (g - b) / s
            : l === g
                ? 2 + (b - r) / s
                : 4 + (r - g) / s
        : 0;
    return [
        60 * h < 0 ? 60 * h + 360 : 60 * h,
        100 * (s ? (l <= 0.5 ? s / (2 * l - s) : s / (2 - (2 * l - s))) : 0),
        (100 * (2 * l - s)) / 2,
    ];
};

export { doFetch, darkMode, getColorArray };