import {defineConfig} from 'vite'

export default defineConfig({
    optimizeDeps: {
        exclude: ['satellite.js']
    },
    resolve: {
        alias: {
            'satellite.js/wasm-build': 'satellite.js/dist'
        }
    }
})