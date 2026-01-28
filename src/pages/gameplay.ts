import { TetrisGame } from "../tetrisGame";
import { type Command as MediapipeCommand, MediapipeController } from "../mediapipeController";
import { type Command as KeyboardCommand, KeyboardController } from "../keyboardController";
import { getInteractionHandler } from "../interactionMap";

// Elemente
const videoEl = document.getElementById("webcam") as HTMLVideoElement;
const overlay = document.getElementById("overlay") as HTMLCanvasElement;
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLDivElement;


// ===== Selected Interactions UI (rechts) =====
type InputType = "movement" | "rotation" | "drop";
type StoredInputs = Record<InputType, string>;

const DEFAULT_INPUTS: StoredInputs = {
  movement: "step",
  rotation: "raise-hand",
  drop: "raise-both-hands",
};

const INTERACTION_LABEL: Record<string, string> = {
  step: "Step left or right", //movement
  lean: "Lean left or right", //movement
  "raise-hand": "Raise your left or right hand", //rotation
  "raise-foot": "Raise your foot", //rotation
  "raise-both-hands": "Raise both hands", //drop
  squat: "Squat", //drop
};

function labelOf(key: string) {
  return INTERACTION_LABEL[key] ?? key;
}

function getSelectedInputs(): StoredInputs {
  try {
    const raw = window.localStorage.getItem("selected_inputs");
    return raw ? { ...DEFAULT_INPUTS, ...JSON.parse(raw) } : DEFAULT_INPUTS;
  } catch {
    return DEFAULT_INPUTS;
  }
}

function renderSelectedInteractions() {
  // Falls du "Controller" im HTML entfernt hast, ist das ok – wir greifen ihn nicht an.
  const movementEl = document.getElementById("selMovement");
  const rotationEl = document.getElementById("selRotation");
  const dropEl = document.getElementById("selDrop");
  if (!movementEl || !rotationEl || !dropEl) return;

  const inputs = getSelectedInputs();
  movementEl.textContent = labelOf(inputs.movement);
  rotationEl.textContent = labelOf(inputs.rotation);
  dropEl.textContent = labelOf(inputs.drop);
}

// ===== Status helper (verhindert Text-Spam) =====
let lastStatus = "";
let lastStatusTime = 0;

function setStatusOnce(text: string, minIntervalMs = 120) {
  const now = Date.now();
  if (text === lastStatus && now - lastStatusTime < minIntervalMs) return;
  lastStatus = text;
  lastStatusTime = now;
  status.textContent = text;
}

// ===== Initialize game =====
const game = new TetrisGame(canvas);

// stop controllers when game ends and update status
game.onGameOver = () => {
  try {
    activeController?.stop();
  } catch (_) {}
  status.textContent = "status: game over";
};

// active controller placeholders
let mpController: MediapipeController | null = null;
let kbController: any = null;
let activeController: { start: () => void; stop: () => void } | null = null;

// visualizer: draws pose and hand landmarks onto overlay canvas
function drawResults(results: any) {
  if (!overlay) return;
  const ctx = overlay.getContext("2d")!;
  const videoW = videoEl.videoWidth || 640;
  const videoH = videoEl.videoHeight || 480;
  overlay.width = videoW;
  overlay.height = videoH;
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  ctx.save();
  // mirror draw to match mirrored video
  ctx.scale(-1, 1);
  ctx.translate(-overlay.width, 0);

  // draw pose landmarks
  if (results.poseLandmarks) {
    ctx.fillStyle = "rgba(0,255,0,0.8)";
    for (const lm of results.poseLandmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * overlay.width, lm.y * overlay.height, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // draw skeleton lines (simple connections)
    const poseConnections = [
      [11, 12],
      [11, 13],
      [13, 15],
      [12, 14],
      [14, 16],
      [23, 24],
      [11, 23],
      [12, 24],
    ];
    ctx.strokeStyle = "rgba(0,255,0,0.6)";
    ctx.lineWidth = 2;
    for (const [a, b] of poseConnections) {
      const A = results.poseLandmarks[a];
      const B = results.poseLandmarks[b];
      if (A && B) {
        ctx.beginPath();
        ctx.moveTo(A.x * overlay.width, A.y * overlay.height);
        ctx.lineTo(B.x * overlay.width, B.y * overlay.height);
        ctx.stroke();
      }
    }
  }

  // draw right/left hand landmarks
  const drawHand = (landmarks: any, color: string) => {
    if (!landmarks) return;
    ctx.fillStyle = color;
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * overlay.width, lm.y * overlay.height, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  drawHand(results.rightHandLandmarks, "rgba(255,0,0,0.9)");
  drawHand(results.leftHandLandmarks, "rgba(0,0,255,0.9)");

  // draw columns overlay inverted to reverse canvas-mirroring for text
  ctx.save();
  ctx.translate(overlay.width, 0);
  ctx.scale(-1, 1);

  for (let i = 0; i < 10; i++) {
    const x = i / 10;
    ctx.strokeStyle = "rgba(255,255,0,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeText(i.toString(), x * overlay.width - 12, i * 24 + 12);
    ctx.strokeText(x.toFixed(1).toString(), x * overlay.width - 12, i * 24 + 24);
    ctx.beginPath();
    ctx.moveTo(x * overlay.width, 0);
    ctx.lineTo(x * overlay.width, overlay.height);
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}

// ===== Previous Input =====
let lastInput: string | null = null;
let lastStepTime = 0;

// ===== Build handlers based on user-selected interactions =====
let moveHandler = getInteractionHandler(null);
let rotationHandler = getInteractionHandler(null);
let dropHandler = getInteractionHandler(null);

function updateHandlersFromStorage() {
  const raw = window.localStorage.getItem("selected_inputs");
  let parsed: any = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      parsed = null;
    }
  }
  if (!parsed) parsed = { movement: null, rotation: null, drop: null };

  moveHandler = getInteractionHandler(parsed.movement);
  rotationHandler = getInteractionHandler(parsed.rotation);
  dropHandler = getInteractionHandler(parsed.drop);

  renderSelectedInteractions();
}

// initialize handlers once
updateHandlersFromStorage();

// listen for storage events (selection changes in another tab)
window.addEventListener("storage", (e) => {
  if (e.key === "selected_inputs") updateHandlersFromStorage();
});

// same-tab: storage event doesn’t fire -> polling
renderSelectedInteractions();
setInterval(renderSelectedInteractions, 250);

// ===== Controllers =====
mpController = new MediapipeController(
  videoEl,
  (cmd: MediapipeCommand) => {
    try {
      if (game.isGameOver) {
        setStatusOnce("status: game over", 0);
        return;
      }

      if (!moveHandler || !rotationHandler || !dropHandler) {
        const notActive = [];
        if (!moveHandler) notActive.push("movement");
        if (!rotationHandler) notActive.push("rotation");
        if (!dropHandler) notActive.push("drop");
        setStatusOnce(`status: no handlers for ${notActive.join(", ")}`, 0);
        console.warn(`Interaction handlers for ${notActive.join(", ")} not set up.`);
        return;
      }

      const cols = (game as any).cols ?? 10;

      // Sammle Status-Parts und setze EINMAL am Ende (kein += mehr!)
      const statusParts: string[] = [];

      // Movement mapping
      const moveAction = moveHandler(cmd, cols);
      if (moveAction.type === "move") {
        game.moveToCol(moveAction.column);
        statusParts.push(`col ${moveAction.column}`);
      } else if ((moveAction as any).type === "step") {
        const now = Date.now();
        const cooldown = 300;
        if (now - lastStepTime > cooldown) {
          const delta = (moveAction as any).delta as -1 | 1;
          if (delta < 0) {
            game.moveLeft();
            statusParts.push("step left");
            lastInput = "stepLeft";
          } else {
            game.moveRight();
            statusParts.push("step right");
            lastInput = "stepRight";
          }
          lastStepTime = now;
        } else {
          statusParts.push("step (waiting)");
        }
      }

      // Rotation mapping
      const rotAction = rotationHandler(cmd, cols);
      if (rotAction.type === "rotate") {
        const dir = rotAction.direction; // clockwise | counterclockwise
        const key = dir === "clockwise" ? "rotateRight" : "rotateLeft";
        if (lastInput !== key) {
          game.rotate(dir === "clockwise" ? "clockwise" : "counterclockwise");
          lastInput = key;
          statusParts.push(`rotate ${dir}`);
        } else {
          statusParts.push(`rotated ${dir}`);
        }
      }

      // Drop mapping
      const dAction = dropHandler(cmd, cols);
      if (dAction.type === "drop") {
        if (lastInput !== "drop") {
          game.startSoftDrop();
          lastInput = "drop";
          statusParts.push("soft-drop start");
        } else {
          statusParts.push("soft-dropping");
        }
      } else {
        game.stopSoftDrop();
        if (lastInput === "drop") {
          lastInput = null;
          statusParts.push("soft-drop stop");
        }
      }

      // Reset debounce for discrete gestures
      if (rotAction.type === "none" && dAction.type === "none") {
        lastInput = null;
      }

      // Optional: override hipX with column value for debug usage elsewhere
      try {
        if (moveAction.type === "move") cmd.hipX = moveAction.column / cols;
      } catch (_) {}

      // EINMAL setzen, throttled
      setStatusOnce(`status: ${statusParts.length ? statusParts.join(" | ") : "idle"}`);
    } catch (e) {
      console.error("Error processing commands:", e);
    }
  },
  drawResults
);

kbController = new KeyboardController((cmd: KeyboardCommand) => {
  if (game.isGameOver) {
    setStatusOnce("status: game over", 0);
    return;
  }

  setStatusOnce(`status: ${cmd}`, 0);
  switch (cmd) {
    case "left":
      game.moveLeft();
      break;
    case "right":
      game.moveRight();
      break;
    case "rotate":
      game.rotate();
      break;
    case "drop":
      game.drop();
      break;
    case "softDropStart":
      game.startSoftDrop();
      break;
    case "softDropStop":
      game.stopSoftDrop();
      break;
  }
});

function setActiveController(name: string) {
  if (activeController) {
    try {
      activeController.stop();
    } catch (_) {}
    activeController = null;
  }

  if (name === "mediapipe") {
    activeController = mpController;
  } else {
    activeController = kbController;
  }

  window.localStorage.setItem("activeController", name);
}

// initialize selection
const selectedController = window.localStorage.getItem("activeController") || "keyboard";
setActiveController(selectedController);

startBtn.addEventListener("click", async () => {
  const current = window.localStorage.getItem("activeController") === "mediapipe" ? "mediapipe" : "keyboard";

  if (current === "mediapipe") {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoEl.srcObject = stream;
      await videoEl.play();
    } catch (err) {
      setStatusOnce("status: camera permission denied", 0);
      console.error("Camera permission denied", err);
      return;
    }
  }

  activeController?.start();
  game.start();
  setStatusOnce("status: running", 0);
});

stopBtn.addEventListener("click", () => {
  activeController?.stop();
  game.stop();
  setStatusOnce("status: stopped", 0);
});
