import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// L'interfaccia viene caricata da file locale nell'app pacchettizzata: percorsi relativi
export default defineConfig({
  plugins: [react()],
  base: "./",
  // 127.0.0.1 esplicito: con Node 18+ "localhost" può risolversi in IPv6 e il comando dev resterebbe in attesa
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
