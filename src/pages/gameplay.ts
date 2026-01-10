import { TetrisGame } from '../tetrisGame'
import { MediapipeController } from '../mediapipeController'
import { KeyboardController } from '../keyboardController'

// Elemente
const videoEl = document.getElementById('webcam') as HTMLVideoElement
const overlay = document.getElementById('overlay') as HTMLCanvasElement
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement
const startBtn = document.getElementById('startBtn') as HTMLButtonElement
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement
const status = document.getElementById('status') as HTMLDivElement
const controllerSelect = document.getElementById('controllerSelect') as HTMLSelectElement

// Initialize game
const game = new TetrisGame(canvas)

// stop controllers when game ends and update status
game.onGameOver = () => {
    try { activeController?.stop() } catch (e) { /* ignore */ }
    status.textContent = 'status: game over'
}

// active controller placeholders
let mpController: MediapipeController | null = null
let kbController: any = null
let activeController: { start: () => void; stop: () => void } | null = null

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

// callback used by controllers to forward high-level commands
const commandCallback = (cmd: 'left' | 'right' | 'rotate' | 'drop' | 'idle') => {
    // Prevent any inputs if the game is over
    if (game.isGameOver) {
        // ensure status reflects game-over state
        status.textContent = 'status: game over'
        return
    }

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
}

// Setup controllers but don't start them yet
mpController = new MediapipeController(videoEl, commandCallback, drawResults)
kbController = new KeyboardController(commandCallback)

function setActiveController(name: string) {
    // stop any active controller first
    if (activeController) {
        try { activeController.stop() } catch (e) { /* ignore */ }
        activeController = null
    }

    if (name === 'mediapipe') {
        activeController = mpController;
    } else {
        activeController = kbController;
    }

    window.localStorage.setItem('activeController', name);
}

// initialize selection
const savedController = window.localStorage.getItem('activeController')
if (savedController) {
    controllerSelect.value = savedController;
}
setActiveController(controllerSelect.value)
controllerSelect.addEventListener('change', (e) => {
    setActiveController((e.target as HTMLSelectElement).value)
})

startBtn.addEventListener('click', async () => {
    // if mediapipe is active, ensure camera stream is running
    if (controllerSelect.value === 'mediapipe') {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true })
            videoEl.srcObject = stream
            await videoEl.play()
        } catch (err) {
            status.textContent = 'status: camera permission denied'
            console.error('Camera permission denied', err)
            return
        }
    }

    activeController?.start()
    game.start()
    status.textContent = 'status: running'
})

stopBtn.addEventListener('click', () => {
    activeController?.stop()
    game.stop()
    status.textContent = 'status: stopped'
})

// Optional: start automatically in dev for convenience (uncomment if desired)
// startBtn.click()
