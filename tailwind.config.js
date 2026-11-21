/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: "class",
    content: ["./index.html", "./js/**/*.js"],
    theme: {
        extend: {
            fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
            colors: { zinc: { 850: "#1f1f23", 900: "#18181b", 950: "#09090b" } }
        }
    }
};
