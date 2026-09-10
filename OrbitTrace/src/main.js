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
const satelliteVelocity = document.getElementById('satelliteVelocity')
const satelliteOrbitalPeriod = document.getElementById('satelliteOrbitalPeriod')
const satelliteNearestCity = document.getElementById('satelliteNearestCity')
const nightTexture = textureLoader.load('/src/assests/nightMap.jpg')
const groundTrackCanvas = document.getElementById('groundTrackCanvas')
const groundTrackContext = groundTrackCanvas.getContext('2d')

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
    globeTexture: {value: globeTexture},
    nightTexture: {value: nightTexture},
    sunDirection: {value: new THREE.Vector3(1, 0, 0)}
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
const selectedSatelliteMaterial = new THREE.MeshBasicMaterial({color: 0xFFED29})
const satelliteMarkers = []
let selectedSatelliteMarker = null
let cameraFocusActive = false
let cameraFocusStart = new THREE.Vector3()
let cameraFocusEnd = new THREE.Vector3()
let cameraFocusProgress = 0
let orbitPath = null
const orbitPathMaterial = new THREE.LineDashedMaterial({color: 0x00ffff, dashSize: 0.15, gapSize: 0.08})
let completedOrbitPath = null
const completedOrbitPathMaterial = new THREE.LineBasicMaterial({color: 0xEE4B2B})

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
  updateSatelliteInfoPanel()
  if(selectedSatelliteMarker) {
    clearGroundTrack()
    drawGroundTrack(selectedSatelliteMarker)
    drawCompletedGroundTrack(selectedSatelliteMarker)
    drawCurrentGroundTrackMarker(selectedSatelliteMarker)
  }
  }, 1000)
}

function updateRealSatellitePosition(marker) {
  const satrec = marker.userData.satrec
  if(!satrec) return
  const now = new Date()
  const positionAndVelocity = satellite.propagate(satrec, now)
  if(!positionAndVelocity || !positionAndVelocity.position || !positionAndVelocity.velocity) return
  const gmst = satellite.gstime(now)
  const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst)
  const latitude = satellite.degreesLat(positionGd.latitude)
  const longitude = satellite.degreesLong(positionGd.longitude)
  const altitude = positionGd.height
  const velocity = Math.sqrt(positionAndVelocity.velocity.x ** 2 + positionAndVelocity.velocity.y ** 2 + positionAndVelocity.velocity.z ** 2)
  const orbitalPeriod = 1440 / marker.userData.MEAN_MOTION
  marker.userData.velocity = velocity
  marker.userData.orbitalPeriod = orbitalPeriod
  marker.userData.latitude = latitude
  marker.userData.longitude = longitude
  marker.userData.altitude = altitude
  updateSatellitePosition(marker, latitude, longitude, altitude)
}

function updateSatelliteInfoPanel() {
  if(!selectedSatelliteMarker) return
  const selectedSatellite = selectedSatelliteMarker.userData

  satelliteLatitude.textContent = `${selectedSatellite.latitude.toFixed(2)}°`
  satelliteLongitude.textContent = `${selectedSatellite.longitude.toFixed(2)}°`
  satelliteAltitude.textContent = `${selectedSatellite.altitude.toFixed(2)} km`
  satelliteVelocity.textContent = `${selectedSatellite.velocity.toFixed(2)} km/s`
  satelliteOrbitalPeriod.textContent = `${selectedSatellite.orbitalPeriod.toFixed(2)} min`
}

orbitTraceSatelliteSearchInput.addEventListener('keydown', (event) => {

  if(orbitPath) {
    earthGroup.remove(orbitPath)
    orbitPath.geometry.dispose()
    orbitPath = null
  }

  if(completedOrbitPath) {
    earthGroup.remove(completedOrbitPath)
    completedOrbitPath.geometry.dispose()
    completedOrbitPath = null
  }

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
  createOrbitPath(foundSatellite)
  createCompletedOrbitPath(foundSatellite)
  updateNearestCity()
  clearGroundTrack()
  drawGroundTrack(foundSatellite)
  drawCompletedGroundTrack(foundSatellite)
  drawCurrentGroundTrackMarker(foundSatellite)

  const selectedSatellite = foundSatellite.userData
  satelliteName.textContent = selectedSatellite.OBJECT_NAME
  satelliteNoradId.textContent = selectedSatellite.NORAD_CAT_ID
  satelliteLatitude.textContent = `${selectedSatellite.latitude.toFixed(2)}°`
  satelliteLongitude.textContent = `${selectedSatellite.longitude.toFixed(2)}°`
  satelliteAltitude.textContent = `${selectedSatellite.altitude.toFixed(2)} km`
  satelliteVelocity.textContent = `${selectedSatellite.velocity.toFixed(2)} km/s`
  satelliteOrbitalPeriod.textContent = `${selectedSatellite.orbitalPeriod.toFixed(2)} min`

  satelliteInfoPanel.classList.add('open')
})

let cameraZoomDirection = new THREE.Vector3(0, 0, 1)

function moveCameraToSatellite(marker) {
  const satellitePosition = new THREE.Vector3()
  marker.getWorldPosition(satellitePosition)
  cameraZoomDirection.copy(satellitePosition).normalize()
  cameraFocusStart.copy(camera.position)
  const focusDistance = 9 + (marker.userData.altitude / 6371) * 5
  cameraFocusEnd.copy(cameraZoomDirection).multiplyScalar(focusDistance)
  cameraFocusProgress = 0
  cameraFocusActive = true
}

function createOrbitPath(marker) {
  const points = []
  const now = new Date()

  for(let i = 0; i <= 360; i++) {
    const time = new Date(now.getTime() + i * 60000)
    const positionAndVelocity = satellite.propagate(marker.userData.satrec, time)
    
    if(!positionAndVelocity || !positionAndVelocity.position) {
      continue
    }

    const gmst = satellite.gstime(time)
    const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst)
    const latitude = satellite.degreesLat(positionGd.latitude)
    const longitude = satellite.degreesLong(positionGd.longitude)
    const altitude = positionGd.height
    const earthRadius = 5
    const altitudeScale = 5 / 6371
    const radius = earthRadius + altitude * altitudeScale
    const lat = THREE.MathUtils.degToRad(latitude)
    const lon = THREE.MathUtils.degToRad(longitude + 90)
    points.push(new THREE.Vector3(radius * Math.cos(lat) * Math.sin(lon), radius * Math.sin(lat), radius * Math.cos(lat) * Math.cos(lon)))
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  orbitPath = new THREE.Line(geometry, orbitPathMaterial)
  orbitPath.computeLineDistances()
  earthGroup.add(orbitPath)
}

function createCompletedOrbitPath(marker) {
  const points = []
  const now = new Date()
  for(let i = 90; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60000)
    const positionAndVelocity = satellite.propagate(marker.userData.satrec, time)

    if(!positionAndVelocity || !positionAndVelocity.position) {
      continue
    }
    
    const gmst = satellite.gstime(time)
    const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst)
    const latitude = satellite.degreesLat(positionGd.latitude)
    const longitude = satellite.degreesLong(positionGd.longitude)
    const altitude = positionGd.height
    const earthRadius = 5
    const altitudeScale = 5 / 6371
    const radius = earthRadius + altitude * altitudeScale
    const lat = THREE.MathUtils.degToRad(latitude)
    const lon = THREE.MathUtils.degToRad(longitude + 90)
    points.push(new THREE.Vector3(radius * Math.cos(lat) * Math.sin(lon), radius * Math.sin(lat), radius * Math.cos(lat) * Math.cos(lon)))
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  completedOrbitPath = new THREE.Line(geometry, completedOrbitPathMaterial)
  earthGroup.add(completedOrbitPath)
}

earthGroup.updateMatrixWorld(true)
camera.updateMatrixWorld(true)
const orbitTraceRaycaster = new THREE.Raycaster()
const orbitTraceMouse = new THREE.Vector2()

renderer.domElement.addEventListener('click', (event) => {
  if(mouse.didMove) return

  const rect = renderer.domElement.getBoundingClientRect()
  orbitTraceMouse.x = ((event.clientX - rect.left) / rect.width) * 2 -1 
  orbitTraceMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  orbitTraceRaycaster.setFromCamera(orbitTraceMouse, camera)
  const satelliteIntersections = orbitTraceRaycaster.intersectObjects(satelliteMarkers, false)
  if(satelliteIntersections.length === 0) {
    satelliteInfoPanel.classList.remove('open')
    removeOrbitPaths()
    return
  }
  const closestIntersection = satelliteIntersections[0]
  const closestSatellite = closestIntersection.object
  const earthIntersections = orbitTraceRaycaster.intersectObject(sphere, false)

  if(earthIntersections.length > 0 && earthIntersections[0].distance < closestIntersection.distance) {
    satelliteInfoPanel.classList.remove('open')
    removeOrbitPaths()
    return
  }

  if(orbitPath) {
    earthGroup.remove(orbitPath)
    orbitPath.geometry.dispose()
    orbitPath = null
  }

  if(completedOrbitPath) {
    earthGroup.remove(completedOrbitPath)
    completedOrbitPath.geometry.dispose()
    completedOrbitPath = null
  }

  if(selectedSatelliteMarker) {
    selectedSatelliteMarker.material = satelliteMaterial
  }

  closestSatellite.material = selectedSatelliteMaterial
  selectedSatelliteMarker = closestSatellite
  moveCameraToSatellite(closestSatellite)
  createCompletedOrbitPath(closestSatellite)
  createOrbitPath(closestSatellite)
  updateNearestCity()
  clearGroundTrack()
  drawGroundTrack(closestSatellite)
  drawCompletedGroundTrack(closestSatellite)
  drawCurrentGroundTrackMarker(closestSatellite)
 
  const selectedSatellite = closestSatellite.userData
  satelliteName.textContent = selectedSatellite.OBJECT_NAME
  satelliteNoradId.textContent = selectedSatellite.NORAD_CAT_ID
  satelliteLatitude.textContent = `${selectedSatellite.latitude.toFixed(2)}°`
  satelliteLongitude.textContent = `${selectedSatellite.longitude.toFixed(2)}°`
  satelliteAltitude.textContent = `${selectedSatellite.altitude.toFixed(2)} km`
  satelliteVelocity.textContent = `${selectedSatellite.velocity.toFixed(2)} km/s`
  satelliteOrbitalPeriod.textContent = `${selectedSatellite.orbitalPeriod.toFixed(2)} min`
  satelliteInfoPanel.classList.add('open')
  return
})

async function updateNearestCity() {
  if(!selectedSatelliteMarker) return
  const satelliteData = selectedSatelliteMarker.userData
  try{const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${satelliteData.latitude}&longitude=${satelliteData.longitude}&localityLanguage=en`
    )
  if(!response.ok) {
    throw new Error('Failed to find nearest city')
  }
  const data = await response.json()
  const city = data.city || data.locality || data.principalSubdivison || 'Unknown'
  satelliteNearestCity.textContent = city
  } catch(error) {
    satelliteNearestCity.textContent = 'Unavailable'
  }
}

function updateSunDirection() {
  const hour = new Date().getHours()
  if(hour >= 6 && hour < 18) {
    sphere.material.uniforms.sunDirection.value.set(1, 0, 0)
  } else {
    sphere.material.uniforms.sunDirection.value.set(-1, 0, 0)
  }
}

updateSunDirection()
setInterval(updateSunDirection, 60000)

function resizeGroundTrackCanvas() {
  groundTrackCanvas.width = groundTrackCanvas.clientWidth
  groundTrackCanvas.height = groundTrackCanvas.clientHeight
}

resizeGroundTrackCanvas()
window.addEventListener('resize', resizeGroundTrackCanvas)

function getGroundTrackPosition(latitude, longitude) {
  const x = ((longitude + 180) / 360) * groundTrackCanvas.width
  const y = ((90 - latitude) / 180) * groundTrackCanvas.height
  return{x, y}
}

function getGroundTrackPoints(marker) {
  const points = []
  const now = new Date()

  for(let i = 0; i <= 180; i++) {
    const time = new Date(now.getTime() + i * 60000)
    const positionAndVelocity = satellite.propagate(marker.userData.satrec, time)

    if(!positionAndVelocity || !positionAndVelocity.position) {
      continue
    }
    const gmst = satellite.gstime(time)
    const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst)
    const latitude = satellite.degreesLat(positionGd.latitude)
    const longitude = satellite.degreesLong(positionGd.longitude)
    points.push({latitude, longitude})
  }
  return points
}

function clearGroundTrack() {
  groundTrackContext.clearRect(0, 0, groundTrackCanvas.width, groundTrackCanvas.height)
}

function drawGroundTrack(marker) {
  const points = getGroundTrackPoints(marker) 
  groundTrackContext.beginPath()
  points.forEach((point, index) => {
    const mapPosition = getGroundTrackPosition(point.latitude, point.longitude)
    if(index === 0) {
      groundTrackContext.moveTo(mapPosition.x, mapPosition.y)
    } else{
      const previousPoint = points[index -1]

      if(Math.abs(point.longitude - previousPoint.longitude) > 180) {
        groundTrackContext.moveTo(mapPosition.x, mapPosition.y)
      } else {
        groundTrackContext.lineTo(mapPosition.x, mapPosition.y)
      }
    }
  })
  groundTrackContext.strokeStyle = '#00ffff'
  groundTrackContext.lineWidth = 2
  groundTrackContext.stroke()
}

function getCompletedGroundTrackPoints(marker) {
  const points = []
  const now = new Date()
  for(let i = 90; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60000)
    const positionAndVelocity = satellite.propagate(marker.userData.satrec, time)
    if(!positionAndVelocity || !positionAndVelocity.position) {
      continue
    }
    const gmst = satellite.gstime(time)
    const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst)
    const latitude = satellite.degreesLat(positionGd.latitude)
    const longitude = satellite.degreesLong(positionGd.longitude)
    points.push({latitude, longitude})
  }
  return points
}

function drawCompletedGroundTrack(marker) {
  const points = getCompletedGroundTrackPoints(marker)
  groundTrackContext.beginPath()
  points.forEach((point, index) => {
    const mapPosition = getGroundTrackPosition(point.latitude, point.longitude)
    if(index === 0) {
      groundTrackContext.moveTo(mapPosition.x, mapPosition.y)
    } else {
      const previousPoint = points[index - 1]
      if(Math.abs(point.longitude - previousPoint.longitude) > 180) {
        groundTrackContext.moveTo(mapPosition.x, mapPosition.y)
      } else {
        groundTrackContext.lineTo(mapPosition.x, mapPosition.y)
      }
    }
  })
  groundTrackContext.strokeStyle = '#EE4B2B'
  groundTrackContext.lineWidth = 2
  groundTrackContext.stroke()
}

function drawCurrentGroundTrackMarker(marker) {
  const latitude = marker.userData.latitude
  const longitude = marker.userData.longitude
  if(latitude === undefined || longitude === undefined) {
    return
  }
  const mapPosition = getGroundTrackPosition(latitude, longitude)
  groundTrackContext.beginPath()
  groundTrackContext.arc(mapPosition.x, mapPosition.y, 5, 0, Math.PI * 2)
  groundTrackContext.fillStyle = '#FFED29'
  groundTrackContext.fill()
}

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
  const zoomAmount = event.deltaY * 0.01
  const currentDistance = camera.position.length()
  const newDistance = THREE.MathUtils.clamp(currentDistance + zoomAmount, 6, 45)
  camera.position.copy(cameraZoomDirection).multiplyScalar(newDistance)
  camera.lookAt(0, 0, 0)
})

function removeOrbitPaths() {
  if(orbitPath) {
      earthGroup.remove(orbitPath)
      orbitPath.geometry.dispose()
      orbitPath = null
    }

    if(completedOrbitPath) {
      earthGroup.remove(completedOrbitPath)
      completedOrbitPath.geometry.dispose()
      completedOrbitPath = null
    }
}

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
      cameraZoomDirection.copy(camera.position).normalize()
    }
  }
}
animate()