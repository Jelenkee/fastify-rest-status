module.exports = {
  purge: [
    "./panel/**/*.html"
  ],
  darkMode: "class",
  theme: {
    extend: {
      screens: {
        sm: "600px"
      },
      colors: {
        darker: "rgba(0, 0, 0, 0.1)",
        lighter: "rgba(255, 255, 255, 0.1)",
        overlay: "rgba(0, 0, 0, 0.4)",
      }
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
}
