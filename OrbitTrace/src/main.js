import * as THREE from 'three'
import vertexShader from '/src/shaders/vertex.glsl?raw'
import fragmentShader from '/src/shaders/fragment.glsl?raw'
import atmosphereVertexShader from '/src/shaders/atmosphereVertex.glsl?raw'
import atmosphereFragmentShader from '/src/shaders/atmosphereFragment.glsl?raw'
import './style.css'
import * as satellite from 'satellite.js'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000)
camera.position.z = 15
const renderer = new THREE.WebGLRenderer({antialias: true})
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
document.body.appendChild(renderer.domElement)
const orbitTraceLoadingScreen = document.getElementById('orbitTraceLoadingScreen')
const loadingProgress = document.getElementById('loadingProgress')
const loadingPercent = document.getElementById('loadingPercent')
const textureLoader = new THREE.TextureLoader()

const satelliteInfoPanel = document.getElementById('satelliteInfoPanel')
const satelliteName = document.getElementById('satelliteName')
const satelliteNoradId = document.getElementById('satelliteNoradId')
const satelliteLatitude = document.getElementById('satelliteLatitude')
const satelliteLongitude = document.getElementById('satelliteLongitude')
const satelliteAltitude = document.getElementById('satelliteAltitude')
const orbitTraceSatelliteSearchInput = document.getElementById('orbitTraceSatelliteSearchInput')

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

const satelliteGeometry = new THREE.SphereGeometry(0.015, 8, 8)
const satelliteMaterial = new THREE.MeshBasicMaterial({color: 0x00ff00})
const selectedSatelliteMaterial = new THREE.MeshBasicMaterial({color: 0xEE4B2B})
const satelliteMarkers = []
let selectedSatelliteMarker = null
let cameraFocusActive = false
let cameraFocusStart = new THREE.Vector3()
let cameraFocusEnd = new THREE.Vector3()
let cameraFocusProgress = 0

function updateSatellitePosition(marker, latitude, longitude, altitude) {
  const earthRadius = 5
  const altitudeScale = 5 / 6371
  const radius = earthRadius + altitude * altitudeScale
  const lat = THREE.MathUtils.degToRad(latitude)
  const lon = THREE.MathUtils.degToRad(longitude + 90)
  marker.position.x = radius * Math.cos(lat) * Math.sin(lon)
  marker.position.y = radius * Math.sin(lat)
  marker.position.z = radius * Math.cos(lat) * Math.cos(lon)
}

const earthGroup = new THREE.Group()
earthGroup.add(sphere)
earthGroup.add(atmosphere)
scene.add(earthGroup)
createSatellites()

async function loadSatelliteData() {
  const response = await fetch('/data/satellites.json')
  if(!response.ok) {
    throw new Error('Failed to load satellite data')
  }
  return await response.json()
}

async function createSatellites() {
  const satellites = await loadSatelliteData()
  satellites.forEach((satelliteData) => {
    const marker = new THREE.Mesh(satelliteGeometry, satelliteMaterial)
    marker.userData = satelliteData
  
    const satrec = satellite.json2satrec(satelliteData)
    marker.userData.satrec = satrec
    
    satelliteMarkers.push(marker)
    earthGroup.add(marker)
    updateRealSatellitePosition(marker)
  })

  setInterval(() => {
  satelliteMarkers.forEach((marker) => {
    updateRealSatellitePosition(marker)
  })
  }, 1000)
}

function updateRealSatellitePosition(marker) {
  const satrec = marker.userData.satrec
  if(!satrec) return
  const now = new Date()
  const positionAndVelocity = satellite.propagate(satrec, now)
  if(!positionAndVelocity || !positionAndVelocity.position) return
  const gmst = satellite.gstime(now)
  const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst)
  const latitude = satellite.degreesLat(positionGd.latitude)
  const longitude = satellite.degreesLong(positionGd.longitude)
  const altitude = positionGd.height
  marker.userData.latitude = latitude
  marker.userData.longitude = longitude
  marker.userData.altitude = altitude
  updateSatellitePosition(marker, latitude, longitude, altitude)
}

orbitTraceSatelliteSearchInput.addEventListener('keydown', (event) => {
  if(event.key !== 'Enter') return
  const searchQuery = orbitTraceSatelliteSearchInput.value.trim().toLowerCase()
  if(!searchQuery) return

  const foundSatellite = satelliteMarkers.find((marker) => {
    const satelliteData = marker.userData
    return satelliteData.OBJECT_NAME?.toLowerCase().includes(searchQuery) || satelliteData.NORAD_CAT_ID?.toString() === searchQuery
  })

  if(!foundSatellite) {
    return
  }

  if(selectedSatelliteMarker) {
    selectedSatelliteMarker.material = satelliteMaterial
  }
  foundSatellite.material = selectedSatelliteMaterial
  selectedSatelliteMarker = foundSatellite
  moveCameraToSatellite(foundSatellite)

  const selectedSatellite = foundSatellite.userData
  satelliteName.textContent = selectedSatellite.OBJECT_NAME
  satelliteNoradId.textContent = selectedSatellite.NORAD_CAT_ID
  satelliteLatitude.textContent = `${selectedSatellite.latitude.toFixed(2)}°`
  satelliteLongitude.textContent = `${selectedSatellite.longitude.toFixed(2)}°`
  satelliteAltitude.textContent = `${selectedSatellite.altitude.toFixed(2)}km`

  satelliteInfoPanel.classList.add('open')
})

function moveCameraToSatellite(marker) {
  const satellitePosition = new THREE.Vector3()
  marker.getWorldPosition(satellitePosition)
  const direction = satellitePosition.clone().normalize()
  cameraFocusStart.copy(camera.position)
  cameraFocusEnd.copy(direction.multiplyScalar(6))
  cameraFocusProgress = 0
  cameraFocusActive = true
}

earthGroup.updateMatrixWorld(true)
camera.updateMatrixWorld(true)

renderer.domElement.addEventListener('click', (event) => {
  if(mouse.didMove) return
  const rect = renderer.domElement.getBoundingClientRect()
  
  const clickX = event.clientX - rect.left
  const clickY = event.clientY - rect.top
  let closestSatellite = null
  let closestDistance = Infinity

  satelliteMarkers.forEach((marker) => {
    const screenPosition = new THREE.Vector3()
    marker.getWorldPosition(screenPosition)
    screenPosition.project(camera)
    if(screenPosition.z < -1 || screenPosition.z > 1) {
      return
    }
    const satelliteX = (screenPosition.x + 1) / 2 * rect.width
    const satelliteY = (-screenPosition.y + 1) / 2 * rect.height
    const distance = Math.sqrt((clickX - satelliteX) ** 2 + (clickY - satelliteY) ** 2)

    if(distance < closestDistance) {
      closestDistance = distance
      closestSatellite = marker
    }
  })

  if(closestSatellite && closestDistance < 25) {
    const selectedSatellite = closestSatellite.userData
    satelliteName.textContent = selectedSatellite.OBJECT_NAME
    satelliteNoradId.textContent = selectedSatellite.NORAD_CAT_ID
    satelliteLatitude.textContent = `${selectedSatellite.latitude}°`
    satelliteLongitude.textContent = `${selectedSatellite.longitude}°`
    satelliteAltitude.textContent = `${selectedSatellite.altitude}km`
    satelliteInfoPanel.classList.add('open')
    return
  }
  satelliteInfoPanel.classList.remove('open')
})

const mouse = {x: 0, y: 0, previousX: 0, previousY: 0, isDragging: false, didMove: false}
const globeRotation ={x: 0, y: 0}
earthGroup.rotation.set(0, 0, 0)

addEventListener('mousedown', (event) => {
  if(event.button !== 0) return
  mouse.isDragging = true
  mouse.didMove = false
  mouse.previousX = event.clientX
  mouse.previousY = event.clientY
})

addEventListener('mouseup', (event) => {
  if(event.button !== 0) return
  mouse.isDragging = false
})

addEventListener('mousemove', (event) => {
  if(!mouse.isDragging) return
  const deltaX = event.clientX - mouse.previousX
  const deltaY = event.clientY - mouse.previousY
  mouse.didMove = true
  globeRotation.y += deltaX * 0.005
  globeRotation.x += deltaY * 0.005
  const maxTilt = Math.PI / 2 - 0.1
  globeRotation.x = Math.max(-maxTilt, Math.min(maxTilt, globeRotation.x))
  earthGroup.rotation.x = globeRotation.x
  earthGroup.rotation.y = globeRotation.y
  mouse.previousX = event.clientX
  mouse.previousY = event.clientY
})

addEventListener('wheel', (event) => {
  camera.position.z += event.deltaY * 0.01
  camera.position.z = Math.max(6, Math.min(30, camera.position.z))
})

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

function animate() {
  requestAnimationFrame(animate)
  renderer.render(scene, camera)

  if(cameraFocusActive) {
    cameraFocusProgress += 0.04
    const progress = Math.min(cameraFocusProgress, 1)
    const smoothProgress = progress * progress * (3 - 2 * progress)
    camera.position.lerpVectors(cameraFocusStart, cameraFocusEnd, smoothProgress)
    camera.lookAt(0, 0, 0)
    if(progress >= 1) {
      cameraFocusActive = false
    }
  }
}
animate()