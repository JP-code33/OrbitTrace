import fs from 'fs/promises'

const celestrakUrl = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=ACTIVE&FORMAT=JSON'
const outputPath = "./data/satellites.json"

async function updateSatellites() {
    console.log('Fetching satellite data from CelesTrak...')
    const response = await fetch(celestrakUrl)
    if(!response.ok) {
        throw new Error(`CelesTrak request failed: ${response.status}`)
    }
    const satellites = await response.json()
    console.log(`Received ${satellites.length} satellites`)
    await fs.writeFile(outputPath, JSON.stringify(satellites, null, 2))
}

updateSatellites().catch((error) => {
    process.exit(1)
})