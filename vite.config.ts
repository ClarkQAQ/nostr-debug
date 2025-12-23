import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        host: "0.0.0.0",
        allowedHosts: true,
    },
    resolve: {
        alias: {
            react: path.resolve("node_modules/react"),
            "react/jsx-runtime": path.resolve("node_modules/react/jsx-runtime"),
        },
    },
});
