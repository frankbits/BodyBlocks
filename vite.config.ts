import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  appType: "mpa",

  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        trainingAuswahl: resolve(__dirname, "training.Auswahl.html"),
        training: resolve(__dirname, "training.html"),
        gameAuswahl: resolve(__dirname, "game.Auswahl.html"),
        game: resolve(__dirname, "game.html"),
      },
    },
  },
});
