import type { UserConfig } from "vite";
import { createHtmlPlugin } from "vite-plugin-html";

export default {
  base: "/vacation-planner/",
  build: {
    minify: true,
    target: "esnext",
  },
  plugins: [createHtmlPlugin({ minify: true })],
} satisfies UserConfig;
