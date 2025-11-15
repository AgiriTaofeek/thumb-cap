import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/oauth": "http://localhost:3000",
      "/youtube": "http://localhost:3000",
      "/upload-url": "http://localhost:3000",
      "/process": "http://localhost:3000",
      "/status": "http://localhost:3000",
      "/videos": "http://localhost:3000",
      "/frames": "http://localhost:3000",
      "/vision": "http://localhost:3000",
      "/thumbnails": "http://localhost:3000",
      "/captions": "http://localhost:3000"
    }
  }
})

