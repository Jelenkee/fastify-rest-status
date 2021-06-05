import svelte from "rollup-plugin-svelte";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import css from "rollup-plugin-css-only";
import postcss from "rollup-plugin-postcss";
import { terser } from "rollup-plugin-terser";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import nested from "postcss-nested";

const dev = process.env.NODE_ENV !== "production"

export default [
    {
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
                compilerOptions: {
                    dev: dev
                },
                emitCss: true,
            }),
            css({
                output: "bundle.css"
            }),
            resolve({
                browser: true,
                dedupe: s => s.startsWith("svelte")
            }),
            commonjs(),
            !dev && terser({
                compress: true,
                mangle: true
            }),
        ]
    },
    {
        input: "./panel/tailwind.css",
        output: {
            file: "./panel/build/main.css"
        },
        plugins: [
            postcss({
                plugins: [
                    nested,
                    tailwindcss,
                    !dev && autoprefixer
                ],
                extract: true,
                minimize: !dev
            }),
        ]
    }

]