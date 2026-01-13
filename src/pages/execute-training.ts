import {TetrisGame} from '../tetrisGame'
import {type Command as MediapipeCommand, MediapipeController} from '../mediapipeController'
import { buildSequenceFromSelected, mapCommandToAction } from '../interactionMap'

const videoEl = document.getElementById('webcam') as HTMLVideoElement
const overlay = document.getElementById('overlay') as HTMLCanvasElement
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement
const status = document.getElementById('status') as HTMLDivElement

const interactionGif = document.getElementById('interactionGif') as HTMLImageElement
const interactionTitle = document.getElementById('interactionTitle') as HTMLHeadingElement
const interactionDesc = document.getElementById('interactionDesc') as HTMLParagraphElement
const startBox = document.getElementById('startBox') as HTMLDivElement
const startBtn = document.getElementById('startBtn') as HTMLButtonElement

// Initialize game
const game = new TetrisGame(canvas)

// stop controllers when game ends and update status
game.onGameOver = () => {
    try {
        activeController?.stop()
    } catch (e) { /* ignore */ }
    status.textContent = 'status: game over'
}

// track training metrics
type Metrics = { durationMs: number; inputs: number; accuracy: number }

let metricsPerInteraction: Record<string, Metrics[]> = {}

// active controller placeholders
let mpController: MediapipeController | null = null
let activeController: { start: () => void; stop: () => void } | null = null

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


// Previous Input
let lastInput: string | null = null;
let lastStepTime = 0

// Setup controllers but don't start them yet
// (initial mpController removed; we create it further down with merged logic)

// activeController = mpController
// activeController.start()
// status.textContent = 'status: mediapipe controller active'

// ----------------- Training Manager -----------------

// Read selected_interactions from localStorage
const stored = window.localStorage.getItem('selected_interactions')
let selectedInteractions: { [input: string]: string[] } = {}
if (stored) {
    try {
        selectedInteractions = JSON.parse(stored)
    } catch (e) {
        console.warn('failed to parse selected_interactions', e)
    }
}

// Flatten into sequence: [{input, interaction}, ...]
const sequence = buildSequenceFromSelected(selectedInteractions)

// If sequence empty but user stored raw interaction ids string, try fallback via parsing
if (sequence.length === 0 && stored) {
    try {
        const parsed = JSON.parse(stored)
        const alt = buildSequenceFromSelected(parsed)
        if (alt.length) {
            // replace
            ;(sequence as any).push(...alt)
        }
    } catch (_) { /* ignore */ }
}

let seqIndex = 0
let runningTraining = false

function updateInteractionUI(item?: { input: string; interaction: string }) {
    if (!item) {
        interactionTitle.textContent = 'No interaction'
        interactionDesc.textContent = 'No interactions selected. Go back and choose some.'
        interactionGif.src = '/movement.png'
        startBox.style.display = 'none'
        return
    }
    interactionTitle.textContent = `${item.input} — ${item.interaction}`
    interactionDesc.textContent = describeInteraction(item.input)
    interactionGif.src = selectGifForInteraction(item.input, item.interaction)
    startBox.style.display = 'flex'
}

function describeInteraction(input: string) {
    // basic descriptions; expand as needed
    if (input === 'movement') return 'Move your body left/right to position the block.'
    if (input === 'rotation') return 'Raise one hand to rotate the block.'
    if (input === 'drop') return 'Raise both hands to drop the block at the right time.'
    return 'Perform the interaction.'
}

function selectGifForInteraction(input: string, interaction: string) {
    // tries to map to public assets; fallback to a generic
    const map: Record<string, string> = {
        'lean': '/lean.gif',
        'step': '/step.gif',
        'raise-hand': '/raise hand.gif',
        'raise-both-hands': '/both_hand.gif',
        'squat': '/squat.gif',
        'jump': '/Jump.gif',
        'raise-foot': '/gifs/rotate-fast.gif'
    }
    return map[interaction] || (input === 'movement' ? '/movement.png' : input === 'rotation' ? '/rotate.png' : '/drop.png')
}

// show first item
if (sequence.length > 0) {
    updateInteractionUI(sequence[seqIndex])
} else {
    updateInteractionUI(undefined)
}

// Training state per current round
let currentStartTime = 0
let currentInputs = 0
let currentAccuracy = 0
let currentTarget: any = null // game-specific target description

// listen for start button
startBtn.addEventListener('click', () => {
    startCurrentTraining()
})

// also support gesture-start (both hands up) by listening to mediapipe events
// use a timestamp debounce so we can reliably reset between rounds
let lastGestureDetectedAt = 0 // ms since epoch, 0 = none
const GESTURE_DEBOUNCE_MS = 500

// helper: begin training of current sequence item
function startCurrentTraining() {
    const item = sequence[seqIndex]
    console.log(`item`, item);
    if (!item) return
    runningTraining = true
    currentStartTime = performance.now()
    currentInputs = 0
    currentAccuracy = 0

    // ensure we allow spawning initially for this round
    try { if ((game as any).suppressNextSpawn) (game as any).suppressNextSpawn(false) } catch (e) { /* ignore */ }

    // prepare gameplay: depending on input, set up a small challenge
    setupChallengeFor(item)

    // replace right column startBox with canvas gameplay (already present)
    startBox.style.display = 'none'
    canvas.style.display = 'block'

    // start game in training mode
    // For training we will spawn a known piece and watch for success
    if (item.input === 'movement') {
        // spawn a random piece and set a target column
        const targetCol = Math.floor(Math.random() * 10)
        currentTarget = { type: 'movement', targetCol }
        spawnTrainingPiece(null, 0)
        // show target on game canvas (column only)
        setGameTargetColumn(targetCol)
        // enable automatic falling for movement training
        try { game.start() } catch (e) { console.warn('game.start failed', e) }
        // try to position piece at target by moving: success when a piece locks and the anchored cells overlap targetCol
    } else if (item.input === 'rotation') {
        currentTarget = { type: 'rotation', requiredRotation: 1 } // simpler: require at least one rotate
        spawnTrainingPiece(null, 0)
        // set ghost to show same piece with required rotation
        try {
            const info = game.getCurrentPieceInfo()
            setGameTargetSpec({ pieceIndex: info.pieceIndex, rotation: currentTarget.requiredRotation, col: null })
        } catch (e) {
            // fallback: try column-only target
            setGameTargetColumn(null)
        }
        // enable automatic falling for rotation training as requested
        try { game.start() } catch (e) { console.warn('game.start failed', e) }
    } else if (item.input === 'drop') {
        // for drop, we'll auto-move piece left/right (simulate) and user must drop when over target
        currentTarget = { type: 'drop', targetCol: Math.floor(Math.random() * 10) }
        // spawn piece and start auto-walk
        spawnTrainingPiece(null, 0)
        // show target
        setGameTargetColumn(currentTarget.targetCol)
        startAutoWalk()
    }

    game.onPieceLocked = (info) => {
        // increment inputs as a simple metric
        currentInputs++
        // evaluate success depending on target
        let success = false
        if (currentTarget.type === 'movement') {
            // check if final column equals target
            success = info.finalCol === currentTarget.targetCol
            currentAccuracy = success ? 1 : 0
        } else if (currentTarget.type === 'rotation') {
            // if rotation changed during piece life, consider success
            // rough heuristic: if the piece rotation at lock equals requiredRotation
            success = info.rotation === currentTarget.requiredRotation
            currentAccuracy = success ? 1 : 0
        } else if (currentTarget.type === 'drop') {
            success = info.finalCol === currentTarget.targetCol
            currentAccuracy = success ? 1 : 0
        }

        // if success, suppress next spawn so simulation doesn't spawn another tetrimino
        if (success) {
            try { if ((game as any).suppressNextSpawn) (game as any).suppressNextSpawn(true) } catch (e) { /* ignore */ }
        }

        // record metric
        const duration = performance.now() - currentStartTime
        const metric: Metrics = { durationMs: duration, inputs: currentInputs, accuracy: currentAccuracy }
        const key = `${item.input}:${item.interaction}`
        if (!metricsPerInteraction[key]) metricsPerInteraction[key] = []
        metricsPerInteraction[key].push(metric)

        // stop auto-walk if any
        stopAutoWalk()

        // clear target visualization
        setGameTargetSpec({ pieceIndex: null, rotation: null, col: null })
        // stop automatic falling when the piece locked (pause game loop)
        try { game.stop() } catch (e) { console.warn('game.stop failed', e) }

        // move to next interaction after short delay
        setTimeout(() => {
            runningTraining = false
            canvas.style.display = 'none'
            startBox.style.display = 'flex'
            seqIndex++
            // allow gesture start again for the next round
            lastGestureDetectedAt = 0
            if (seqIndex >= sequence.length) {
                // done
                interactionTitle.textContent = 'Training complete'
                interactionDesc.textContent = 'All selected interactions trained.'
                startBox.style.display = 'none'
                // ensure no lingering target
                setGameTargetSpec({ pieceIndex: null, rotation: null, col: null })
                console.log('metrics', metricsPerInteraction)
            } else {
                updateInteractionUI(sequence[seqIndex])
            }
        }, 800)
    }

    // ensure mediapipe controller active
    if (mpController) {
        activeController = mpController
        activeController.start()
    }
}

function setupChallengeFor(item: { input: string; interaction: string }) {
    // display target info in middle box
    if (item.input === 'movement') {
        interactionDesc.textContent = `Place the block at the highlighted column.`
    } else if (item.input === 'rotation') {
        interactionDesc.textContent = `Rotate the block to the correct orientation.`
    } else if (item.input === 'drop') {
        interactionDesc.textContent = `Drop the block when it is over the target column.`
    }
}

// Auto-walk for 'drop' challenge: move piece left/right periodically
let autoWalkHandle: number | null = null
let autoDir = 1
let autoTargetCol: number | null = null
function startAutoWalk() {
    stopAutoWalk()
    autoTargetCol = null
    autoDir = 1

    autoWalkHandle = window.setInterval(() => {
        const info = (game as any).getCurrentPieceInfo ? game.getCurrentPieceInfo() : null
        if (!info) return
        const cols = (game as any).cols ?? 10
        const pieceWidth = info.pieceWidth || 1

        const minCol = 0
        const maxCol = Math.max(0, cols - pieceWidth)

        if (autoTargetCol === null) autoTargetCol = info.pieceCol

        const beforeCol = info.pieceCol

        // determine if we should flip because we're at boundaries
        if (beforeCol <= minCol) autoDir = 1
        if (beforeCol >= maxCol) autoDir = -1

        let moved = false
        try {
            if ((game as any).autoStep && typeof (game as any).autoStep === 'function') {
                // try moving one step in current direction
                moved = (game as any).autoStep(autoDir)
                if (!moved) {
                    // flip and try once
                    autoDir = -autoDir
                    moved = (game as any).autoStep(autoDir)
                }
            } else {
                // fallback to public movement
                if (autoDir > 0) game.moveRight(); else game.moveLeft()
                const afterInfo = (game as any).getCurrentPieceInfo ? game.getCurrentPieceInfo() : null
                const afterCol = afterInfo ? afterInfo.pieceCol : beforeCol
                if (afterCol === beforeCol) {
                    autoDir = -autoDir
                    if (autoDir > 0) game.moveRight(); else game.moveLeft()
                }
                moved = true
            }
        } catch (e) {
            console.warn('autoWalk error', e)
        }

        const newInfo = (game as any).getCurrentPieceInfo ? game.getCurrentPieceInfo() : null
        autoTargetCol = newInfo ? newInfo.pieceCol : beforeCol

        // ensure next tick direction respects edges
        if (autoTargetCol <= minCol) autoDir = 1
        if (autoTargetCol >= maxCol) autoDir = -1

    }, 200)
}

function stopAutoWalk() {
    if (autoWalkHandle) {
        clearInterval(autoWalkHandle)
        autoWalkHandle = null
    }
}

// detect gesture start by watching mediapipe commands (bothHandsUp)
mpController = new MediapipeController(videoEl, (cmd: MediapipeCommand) => {
    try {
        // map torso position to column
        let col = 9 - Math.floor(cmd.hipX * 10);
        col = Math.min(9, Math.max(0, col));

        // If not currently running a training, prioritize the gesture-start (both hands up)
        if (!runningTraining && cmd.bothHandsUp) {
            const now = Date.now()
            if (now - lastGestureDetectedAt > GESTURE_DEBOUNCE_MS) {
                lastGestureDetectedAt = now
                startCurrentTraining()
                return
            }
        }

        // Determine the current interaction id (if a training is running, use that; otherwise null)
        const currentInteractionId = runningTraining && sequence[seqIndex] ? sequence[seqIndex].interaction : null

        // Map the mediapipe command to a game action for the current interaction
        const action = mapCommandToAction(currentInteractionId, cmd)

        // execute only the allowed action; keep lastInput debouncing for discrete actions
        if (action.type === 'move') {
            status.textContent = `status: movement`
            game.moveToCol(action.column)
        } else if ((action as any).type === 'step') {
            // discrete step left/right with small cooldown
            const now = Date.now()
            const cooldown = 300 // ms
            if (now - lastStepTime > cooldown) {
                const delta = (action as any).delta as -1 | 1
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
                // count as an input for training metrics
                if (runningTraining) currentInputs++
            } else {
                status.textContent = `status: step (waiting)`
            }
        } else if (action.type === 'rotate') {
            status.textContent = `status: rotation`
            const key = action.direction === 'clockwise' ? 'rotateRight' : 'rotateLeft'
            if (lastInput !== key) {
                game.rotate(action.direction === 'clockwise' ? 'clockwise' : 'counterclockwise')
                lastInput = key
                currentInputs++
                status.textContent += ` (${action.direction})`
            }
        } else if (action.type === 'drop') {
            status.textContent = `status: drop`
            if (lastInput !== 'drop') {
                game.drop()
                lastInput = 'drop'
                currentInputs++
                status.textContent += ' (drop)'
            }
        } else {
            // not running or no action
            if (!runningTraining && cmd.bothHandsUp) {
                const now = Date.now()
                if (now - lastGestureDetectedAt > GESTURE_DEBOUNCE_MS) {
                    lastGestureDetectedAt = now
                    startCurrentTraining()
                }
            }
            status.textContent = `status: idle`;
            lastInput = null
        }
    } catch (e) {
        console.error('Error processing commands in training controller:', e)
    }

}, drawResults)

// ensure mediapipe controller started for gesture detection
mpController.start()
status.textContent = 'status: mediapipe controller active for training'

// expose metrics for debugging
;(window as any).__trainingMetrics = metricsPerInteraction

// Expose debug handles for interactive testing
;(window as any).game = game
;(window as any).spawnTrainingPiece = spawnTrainingPiece
;(window as any).startAutoWalk = startAutoWalk
;(window as any).stopAutoWalk = stopAutoWalk

// compatibility helper: spawn piece for training (fallbacks if spawnPiece missing)
function spawnTrainingPiece(pieceIndex: number | null = null, rotation: number = 0) {
    // preferred: use public API
    if ((game as any).spawnPiece && typeof (game as any).spawnPiece === 'function') {
        try { (game as any).spawnPiece(pieceIndex, rotation) } catch (e) { console.warn('spawnPiece failed', e) }
        return
    }

    // fallback: try calling private resetPiece and set rotation/index if possible
    try {
        if (pieceIndex !== null) (game as any).pieceIndex = pieceIndex
        if ((game as any).rotation !== undefined) (game as any).rotation = rotation
        if ((game as any).resetPiece && typeof (game as any).resetPiece === 'function') {
            (game as any).resetPiece()
            return
        }
    } catch (e) {
        console.warn('fallback spawn failed to set internal state', e)
    }

    // last resort: start the game to ensure a piece exists
    try { game.start() } catch (e) { console.error('last-resort spawn failed', e) }
}

// Robust wrapper to set target column on the game if supported
function setGameTargetColumn(col: number | null) {
    try {
        if ((game as any).setTargetColumn && typeof (game as any).setTargetColumn === 'function') {
            (game as any).setTargetColumn(col)
        } else {
            // try a permissive fallback: if game exposes targetCol directly, set it and render
            if ((game as any).targetCol !== undefined) {
                (game as any).targetCol = col
                if ((game as any).render && typeof (game as any).render === 'function') (game as any).render()
            }
        }
    } catch (e) {
        console.warn('setGameTargetColumn failed', e)
    }
}

// Robust wrapper to set target spec on the game if supported
function setGameTargetSpec(spec: { pieceIndex?: number | null; rotation?: number | null; col?: number | null }) {
    try {
        if ((game as any).setTargetSpec && typeof (game as any).setTargetSpec === 'function') {
            (game as any).setTargetSpec(spec)
        } else {
            if ((game as any).targetPieceIndex !== undefined) (game as any).targetPieceIndex = spec.pieceIndex ?? null
            if ((game as any).targetRotation !== undefined) (game as any).targetRotation = spec.rotation ?? null
            if ((game as any).targetCol !== undefined) (game as any).targetCol = spec.col ?? null
            if ((game as any).render && typeof (game as any).render === 'function') (game as any).render()
        }
    } catch (e) {
        console.warn('setGameTargetSpec failed', e)
    }
}
