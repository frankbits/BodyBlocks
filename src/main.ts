import './style.css'

import { MediapipeController } from './mediapipeController'
import { TetrisGame } from './tetrisGame'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="top">
    <h1>BodyBlocks</h1>
  </div>
  <div class="layout">
    <div class="video-column">
      <div class="video-wrap" style="position:relative; display:inline-block;">
        <video id="webcam" autoplay playsinline muted style="transform: scaleX(-1);"></video>
        <canvas id="overlay" class="overlay-canvas"></canvas>
      </div>
      <div class="controls">
        <button id="startBtn" type="button">Start</button>
        <button id="stopBtn" type="button">Stop</button>
        <div id="status">status: idle</div>
      </div>
    </div>
    <div class="game-column">
      <canvas id="gameCanvas"></canvas>
    </div>
  </div>
  <p class="read-the-docs">Move your torso left/right, raise right hand to rotate, both hands above head or crouch to drop.</p>
`

// Elemente
const videoEl = document.getElementById('webcam') as HTMLVideoElement
const overlay = document.getElementById('overlay') as HTMLCanvasElement
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement
const startBtn = document.getElementById('startBtn') as HTMLButtonElement
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement
const status = document.getElementById('status') as HTMLDivElement

// Initialize game
const game = new TetrisGame(canvas)

// visualizer: draws pose and hand landmarks onto overlay canvas
function drawResults(results: any) {
  if (!overlay) return
  const ctx = overlay.getContext('2d')!
  const videoW = videoEl.videoWidth || 640
  const videoH = videoEl.videoHeight || 480
  overlay.width = videoW
  overlay.height = videoH
  ctx.clearRect(0, 0, overlay.width, overlay.height)

  ctx.save()
  // mirror draw to match mirrored video
  ctx.scale(-1, 1)
  ctx.translate(-overlay.width, 0)

  // draw pose landmarks
  if (results.poseLandmarks) {
    ctx.fillStyle = 'rgba(0,255,0,0.8)'
    for (const lm of results.poseLandmarks) {
      ctx.beginPath()
      ctx.arc(lm.x * overlay.width, lm.y * overlay.height, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    // draw skeleton lines (simple connections)
    const poseConnections = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // shoulders -> arms
      [23, 24], [11, 23], [12, 24] // hips
    ]
    ctx.strokeStyle = 'rgba(0,255,0,0.6)'
    ctx.lineWidth = 2
    for (const [a, b] of poseConnections) {
      const A = results.poseLandmarks[a]
      const B = results.poseLandmarks[b]
      if (A && B) {
        ctx.beginPath()
        ctx.moveTo(A.x * overlay.width, A.y * overlay.height)
        ctx.lineTo(B.x * overlay.width, B.y * overlay.height)
        ctx.stroke()
      }
    }
  }

  // draw right/left hand landmarks
  const drawHand = (landmarks: any, color: string) => {
    if (!landmarks) return
    ctx.fillStyle = color
    for (const lm of landmarks) {
      ctx.beginPath()
      ctx.arc(lm.x * overlay.width, lm.y * overlay.height, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  drawHand(results.rightHandLandmarks, 'rgba(255,0,0,0.9)')
  drawHand(results.leftHandLandmarks, 'rgba(0,0,255,0.9)')

  ctx.restore()
}

// Initialize controller with visualizer
const controller = new MediapipeController(videoEl, (cmd) => {
  status.textContent = `status: ${cmd}`
  switch (cmd) {
    case 'left':
      game.moveLeft()
      break
    case 'right':
      game.moveRight()
      break
    case 'rotate':
      game.rotate()
      break
    case 'drop':
      game.drop()
      break
  }
}, drawResults)

startBtn.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    videoEl.srcObject = stream
    await videoEl.play()
  } catch (err) {
    status.textContent = 'status: camera permission denied'
    console.error('Camera permission denied', err)
    return
  }

  controller.start()
  game.start()
  status.textContent = 'status: running'
})

stopBtn.addEventListener('click', () => {
  controller.stop()
  game.stop()
  status.textContent = 'status: stopped'
})

// Optional: start automatically in dev for convenience (uncomment if desired)
// startBtn.click()
