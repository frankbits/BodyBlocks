import {TetrisGame} from '../tetrisGame'
import {type Command as MediapipeCommand, MediapipeController} from '../mediapipeController'
import {type Command as KeyboardCommand, KeyboardController} from '../keyboardController'
import {getInteractionHandler} from '../interactionMap'

// Elemente
const videoEl = document.getElementById('webcam') as HTMLVideoElement
const overlay = document.getElementById('overlay') as HTMLCanvasElement
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement
const startBtn = document.getElementById('startBtn') as HTMLButtonElement
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement
const status = document.getElementById('status') as HTMLDivElement
const selectedController = window.localStorage.getItem('activeController') || 'keyboard';

// Initialize game
const game = new TetrisGame(canvas)

// stop controllers when game ends and update status
game.onGameOver = () => {
    try {
        activeController?.stop()
    } catch (e) { /* ignore */
    }
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

    // draw columns overlay inverted to reverse canvas-mirroring for text
    ctx.save()
    ctx.translate(overlay.width, 0)
    ctx.scale(-1, 1);
    //draw columns
    for (let i = 0; i < 10; i++) {
        const x = i/10;

        ctx.strokeStyle = 'rgba(255,255,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeText(i.toString(), x * overlay.width - 12, i*24 + 12);
        ctx.strokeText(x.toFixed(1).toString(), x * overlay.width - 12, i*24 + 24);
        ctx.beginPath();
        ctx.moveTo(x * overlay.width, 0);
        ctx.lineTo(x * overlay.width, overlay.height);
        ctx.stroke();
    }
    ctx.restore()

    ctx.restore()
}

function showMPCommands(cmd: MediapipeCommand) {
    const commandList = document.querySelector('.command-list') as HTMLUListElement;
    if (!commandList) return;
    commandList.innerHTML = '';
    for (const key in cmd) {
        let command = cmd[key as keyof MediapipeCommand];
        const li = document.createElement('li');
        li.textContent = `${key}: ${command}`;
        if (typeof command === 'boolean' && command) {
            li.style.color = 'green';
        } else if (key === 'hipX') {
            li.textContent = `column: ${command}`;
        } else if (typeof command === 'number') {
            li.textContent = `${key}: ${command.toFixed(2)}`;
            if (command > 0) {
                li.style.color = 'green';
            } else {
                li.style.color = 'red';
            }
        }
        commandList.appendChild(li);
    }
}

// Previous Input
let lastInput: string | null = null;
let lastStepTime = 0

// Build handlers based on user-selected interactions
let moveHandler = getInteractionHandler(null)
let rotationHandler = getInteractionHandler(null)
let dropHandler = getInteractionHandler(null)

function updateHandlersFromStorage() {
    const raw = window.localStorage.getItem('selected_inputs')
    let parsed: any = null
    if (raw) {
        try { parsed = JSON.parse(raw) } catch (_) { parsed = raw }
    }
    if (!parsed) return;
    moveHandler = getInteractionHandler(parsed.movement)
    rotationHandler = getInteractionHandler(parsed.rotation)
    dropHandler = getInteractionHandler(parsed.drop)
}

// initialize handlers once
updateHandlersFromStorage()

// listen for storage events (in case selection changes in another tab)
window.addEventListener('storage', (e) => {
    if (e.key === 'selected_inputs') updateHandlersFromStorage()
})

// Setup controllers but don't start them yet
mpController = new MediapipeController(videoEl, (cmd: MediapipeCommand) => {
    try {
        // Prevent any inputs if the game is over
        if (game.isGameOver) {
            // ensure status reflects game-over state
            status.textContent = 'status: game over'
            return
        }

        //TODO: mapping not working anymore...

        // First, movement mapping (continuous)
        const moveAction = moveHandler(cmd, (game as any).cols ?? 10)
        if (moveAction.type === 'move') {
            game.moveToCol(moveAction.column)
            status.textContent = `status: col ${moveAction.column}`
        } else if ((moveAction as any).type === 'step') {
            // discrete step left/right with small cooldown
            const now = Date.now()
            const cooldown = 300 // ms
            if (now - lastStepTime > cooldown) {
                const delta = (moveAction as any).delta as -1 | 1
                if (delta < 0) {
                    game.moveLeft()
                    status.textContent = `status: step left`
                    lastInput = 'stepLeft'
                } else {
                    game.moveRight()
                    status.textContent = `status: step right`
                    lastInput = 'stepRight'
                }
                lastStepTime = now
            } else {
                // still in cooldown, show status
                status.textContent = `status: step (waiting)`
            }
        }

        // Rotation mapping (discrete)
        const rotAction = rotationHandler(cmd, (game as any).cols ?? 10)
        if (rotAction.type === 'rotate') {
            const key = rotAction.direction === 'clockwise' ? 'rotateRight' : 'rotateLeft'
            if (lastInput !== key) {
                game.rotate(rotAction.direction === 'clockwise' ? 'clockwise' : 'counterclockwise')
                lastInput = key
                status.textContent += ` (${rotAction.direction})`
            } else {
                status.textContent += ` (rotated ${rotAction.direction})`
            }
        }

        // Drop mapping (discrete)
        const dAction = dropHandler(cmd, (game as any).cols ?? 10)
        if (dAction.type === 'drop') {
            if (lastInput !== 'drop') {
                game.drop()
                lastInput = 'drop'
                status.textContent += ' (drop)'
            } else {
                status.textContent += ' (dropped)'
            }
        }

        // If nothing discrete was active, reset lastInput so repeated actions can fire again
        if (rotAction.type === 'none' && dAction.type === 'none') {
            // allow movement to be continuous; reset debounce for discrete gestures
            lastInput = null
        }

        // for display/debug, override hipX with column value
        try {
            if (moveAction.type === 'move') cmd.hipX = moveAction.column / ((game as any).cols ?? 10)
        } catch (e) { /* ignore */ }

        showMPCommands(cmd);
    } catch (e) {
        console.error('Error processing commands:', e);
    }
}, drawResults);

kbController = new KeyboardController((cmd: KeyboardCommand) => {
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
});

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
setActiveController(selectedController);
// mpController.start() //uncomment to start mediapipe immediately for testing

startBtn.addEventListener('click', async () => {
    // if mediapipe is active, ensure camera stream is running
    if (selectedController === 'mediapipe') {
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
