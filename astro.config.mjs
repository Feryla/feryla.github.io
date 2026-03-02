import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://feryla.net",
  trailingSlash: "always",
  markdown: {
    shikiConfig: {
      theme: "gruvbox-dark-medium",
    },
  },
});
