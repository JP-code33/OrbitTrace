import {defineConfig} from 'vite'

export default defineConfig({
    optimizeDeps: {
        exclude: ['satellite.js']
    },
    resolve: {
        alias: {
            'satellite.js': 'satellite.js/dist/satellite.es.js'
        }
    }
})