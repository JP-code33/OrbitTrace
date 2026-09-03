import * as THREE from 'three'
import vertexShader from '/src/shaders/vertex.glsl?raw'
import fragmentShader from '/src/shaders/fragment.glsl?raw'
import atmosphereVertexShader from '/src/shaders/atmosphereVertex.glsl?raw'
import atmosphereFragmentShader from '/src/shaders/atmosphereFragment.glsl?raw'
import './style.css'
import * as satellite from 'satellite.js'
import { StaticElement } from 'three/examples/jsm/transpiler/AST.js'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000)
const renderer = new THREE.WebGLRenderer({antialias: true})
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
document.body.appendChild(renderer.domElement)
const orbitTraceLoadingScreen = document.getElementById('orbitTraceLoadingScreen')
const loadingProgress = document.getElementById('loadingProgress')
const loadingPercent = document.getElementById('loadingPercent')
const textureLoader = new THREE.TextureLoader()

const globeTexture = textureLoader.load('/src/assets/earthMap.png', 
  () => {
    loadingProgress.style.width = '100%'
    loadingPercent.textContent = '100%'

    setTimeout(() => {
      orbitTraceLoadingScreen.style.opacity = '0'
      setTimeout(() => {
        orbitTraceLoadingScreen.remove()
      }, 1000)
    }, 600)
  },
  (progress) => {
    if(progress.total > 0) {
      const percent = Math.round((progress.loaded / progress.total) * 100)
      loadingProgress.style.width = `${percent}%`
      loadingPercent.textContent = `${percent}%`
    }
  }, (error) => {
    console.error('Failed to load Earth Texture:', error)
  }
)


const sphere = new THREE.Mesh(new THREE.SphereGeometry(5, 50, 50), new THREE.ShaderMaterial({
  vertexShader, fragmentShader,
  uniforms: {
    globeTexture: {value: globeTexture}
  }
}))


const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(5, 50, 50),
  new THREE.ShaderMaterial({
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide
  })
)

atmosphere.scale.set(1.1, 1.1, 1.1)
scene.add(atmosphere)

const satelliteGeometry = new THREE.SphereGeometry(0.036, 8, 8)
const satelliteMaterial = new THREE.MeshBasicMaterial({color: 0x9cff00})
const satelliteMarker = new THREE.Mesh(satelliteGeometry, satelliteMaterial)
scene.add(satelliteMarker)

function updateSatellitePosition(marker, latitude, longitude, alitude) {
  const earthRadius = 5
  const altitudeScale = 5 / 6371
  const radius = earthRadius + alitude + altitudeScale
  const lat = new THREE.MathUtils.degToRad(latitude)
  const lon = new THREE.MathUtils.degToRad(longitude)
  marker.position.x = radius * Math.sin(lat) * Math.sin(lon)
  marker.position.y = radius * Math.cos(lat)
  marker.position.z = radius * Math.cos(lat) * Math.cos(lon)
}

const group = new THREE.Group()
group.add(sphere)
scene.add(group)

const starGeometry = new THREE.BufferGeometry()
const starMaterial = new THREE.PointsMaterial({color: 0xffffff})
const starVertices = []
for (let i = 0; i < 10000; i++) {
  const x = (Math.random() - 0.5) * 2000
  const y = (Math.random() - 0.5) * 2000
  const z = -Math.random() * 4000
  starVertices.push(x, y, z)
}
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3))

const stars = new THREE.Points(starGeometry, starMaterial)
scene.add(stars)


const mouse = {x: 0, y: 0, previousX: 0, previousY: 0, isDragging: false}

camera.position.z = 15
function animate() {
  requestAnimationFrame(animate)
  renderer.render(scene, camera)
  if(!mouse.isDragging) {
    sphere.rotation.y += 0.0005
  }
}
animate()

addEventListener('mousedown', (event) => {
  if(event.button === 0) {
    mouse.isDragging = true
    mouse.previousX = event.clientX
    mouse.previousY = event.clientY
  }
})

addEventListener('mouseup', (event) => {
  if(event.button === 0) {
    mouse.isDragging = false
  }
})

addEventListener('mousemove', (event) => {
  if(!mouse.isDragging) return
  const deltaX = event.clientX - mouse.previousX
  const deltaY = event.clientY - mouse.previousY
  group.rotation.y += deltaX * 0.005
  group.rotation.x += deltaY * 0.005
  mouse.previousX = event.clientX
  mouse.previousY = event.clientY
})

async function loadSatelliteData() {
  try {
    const response = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE`)
    if(!response.ok) {
      throw new Error(`Satellite data request failed: ${response.status}`)
      }
      const tleText = await response.text()
      
      console.log('ISS TLE: ')
      console.log(tleText)
      const lines = tleText.trim().split('\n')
      const name = lines[0].trim()
      const line1 = lines[1].trim()
      const line2 = lines[2].trim()
      console.log('Name:', name)
      console.log('Line 1:', line1)
      console.log('Line 2:', line2)

      const satrec = satellite.twoline2satrec(line1, line2)
      const now = new Date()
      const gmst = satellite.gstime(now)
      const positionAndVelocity = satellite.propagate(satrec, now)
      const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst)
      const latitude = satellite.degreesLat(positionGd.latitude)
      const longitude = satellite.degreesLong(positionGd.longitude)
      const altitude = positionGd.height
      updateSatellitePosition(satelliteMarker, latitude, longitude, altitude)

      console.log('ISS position:')
      console.log('Latitude:', latitude)
      console.log('Longitude:', longitude)
      console.log('Altitude:', altitude)
  } catch (error) {
    console.log('Failed to load satellite data:', error)
  }
}

loadSatelliteData()