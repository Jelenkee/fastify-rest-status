const colors = require("tailwindcss/colors");

module.exports = {
  mode: "jit",
  purge: {
    content: [
      "./panel/**/*.html"
    ],
    options: {
      defaultExtractor: content => (content.match(/[^<>"'`\s]*[^<>"'`\s:]/g) || [])
        .map(w => w.startsWith("class:") ? w.slice(6) : w)
        .map(w => w.endsWith("=") ? w.slice(0, -1) : w)
    }
  },
  darkMode: "class",
  theme: {
    extend: {
      screens: {
        sm: "600px"
      },
      colors: {
        darker: "rgba(0, 0, 0, 0.1)",
        darker2: "rgba(0, 0, 0, 0.7)",
        lighter: "rgba(255, 255, 255, 0.1)",
        lighter2: "rgba(255, 255, 255, 0.7)",
        overlay: "rgba(0, 0, 0, 0.4)",
        gray: colors.trueGray,
        darkFont: "rgb(38, 38, 38)",
        brightFont: "rgb(234, 234, 234)",
      },
      maxWidth: {
        oneQuarter: "25%",
        half: "50%",
        threeQuarter: "75%",
      },
      fontFamily: {
        mono: "Ubuntu Mono, monospace"
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
}
