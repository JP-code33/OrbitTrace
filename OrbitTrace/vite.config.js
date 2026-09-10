import {defineConfig} from 'vite'
import path from 'path'

export default defineConfig({
    worker: {
        format: "es"
    },
    optimizeDeps: {
        exclude: ["satellite.js"]
    },
    resolve: {
        alias: {
            "satellite.js": path.resolve(__dirname, "./node_modules/satellite.js/dist/satellite.es.js")
        }
    }
})