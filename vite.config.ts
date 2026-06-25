typescript
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // 👇 Add the block below to inject the base URL safely into the nested Vite configurations
  vite: {
    base: process.env.NODE_ENV === 'production' ? '/jazz-bar/' : '/',
  }
});
