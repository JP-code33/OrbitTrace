import * as THREE from 'three'
import vertexShader from '/src/shaders/vertex.glsl?raw'
import fragmentShader from '/src/shaders/fragment.glsl?raw'
import atmosphereVertexShader from '/src/shaders/atmosphereVertex.glsl?raw'
import atmosphereFragmentShader from '/src/shaders/atmosphereFragment.glsl?raw'



const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000)
const renderer = new THREE.WebGLRenderer({antialias: true})
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
document.body.appendChild(renderer.domElement)

const sphere = new THREE.Mesh(new THREE.SphereGeometry(5, 50, 50), new THREE.ShaderMaterial({
  vertexShader, fragmentShader,
  uniforms: {
    globeTexture: {value: new THREE.TextureLoader().load('/src/assets/earthMap.png')}
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
    sphere.rotation.y += 0.001
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