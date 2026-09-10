import {defineConfig} from 'vite'

export default defineConfig({
    worker: {
        format: "es"
    },
    optimizeDeps: {
        exclude: ["satellite.js"]
    },
    resolve: {
        alias: {
            "satellite.js": "satellite.js/dist/satellite.es.js"
        }
    }
})