import svelte from "rollup-plugin-svelte";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import css from "rollup-plugin-css-only";
import { terser } from "rollup-plugin-terser";

const dev = process.env.DEV === "true"

export default {
    input: "panel/main.js",
    output: {
        sourcemap: false,
        format: "iife",
        name: "app",
        file: "panel/build/bundle.js"
    },
    plugins: [
        svelte({
            extensions: [".html"],
            include: "panel/components/**/*.html",
            compilerOptions: false
        }),
        css({
            output: "bundle.css"
        }),
        resolve({
            browser: true,
            dedupe: ["svelte"]
        }),
        commonjs(),
        !dev && terser({
            compress: true,
            mangle: true
        }),
    ]
}