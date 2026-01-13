import { Holistic, type Results } from '@mediapipe/holistic';
import { Camera } from '@mediapipe/camera_utils';

export type Command = {
    'idle': boolean,
    'hipLeft': boolean,
    'hipRight': boolean,
    'hipDeltaX': number,
    'hipX': number,
    'leftHandUp': boolean,
    'rightHandUp': boolean,
    'leanLeft': boolean,
    'leanRight': boolean,
    'bothHandsUp': boolean,
    'squat': boolean
};
type CommandCallback = (cmd: Command) => void;
type VisualizerCallback = (results: Results) => void;

export class MediapipeController {
    private holistic: Holistic;
    private camera?: Camera;
    private callback: CommandCallback;
    private visualizer?: VisualizerCallback;
    private lastCommandAt = 0;
    private cooldown = 300; // ms
    private smoothTorsoX = 0;
    private alpha = 0.2; // smoothing factor
    private lastState: Command | null = null; // track last emitted state

    private initialLandmarks: Results | null = null;
    private initialHipYAvg: number | null = null; // store standing hip Y to detect squat

    // Neue Felder für robuste Squat-Erkennung
    private squatState = false; // debounced state (true = currently in squat)
    private squatCandidateAt: number | null = null; // when raw detection started
    private squatReleaseAt: number | null = null; // when raw non-detection started while in squat
    private squatHoldMs = 300; // require detection for 300ms to enter squat
    private squatReleaseMs = 200; // require non-detection for 200ms to exit squat

    // Added an optional third parameter to receive raw Results for visualization
    constructor(videoElement: HTMLVideoElement, callback: CommandCallback, visualizer?: VisualizerCallback) {
        this.callback = callback;
        this.visualizer = visualizer;
        this.holistic = new Holistic({
            locateFile: (file) => {
                try {
                    const isProd = (import.meta as any)?.env?.PROD;
                    if (isProd) {
                        const cdnPath = `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
                        // eslint-disable-next-line no-console
                        console.debug('[Mediapipe] locateFile (prod cdn) ->', cdnPath);
                        return cdnPath;
                    }
                } catch (e) {
                    // ignore and fall back to dev path
                }
                const devPath = `/node_modules/@mediapipe/holistic/${file}`;
                // eslint-disable-next-line no-console
                console.debug('[Mediapipe] locateFile (dev) ->', devPath);
                return devPath;
            }
        });
        this.holistic.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            refineFaceLandmarks: false
        });
        this.holistic.onResults(this.onResults.bind(this));
        this.camera = new Camera(videoElement, {
            onFrame: async () => await this.holistic.send({ image: videoElement }),
            width: 640,
            height: 480
        });
    }

    start() {
        this.camera?.start();
    }

    stop() {
        this.camera?.stop();
    }

    /**
     * Trigger callback on state change.
     *
     * @param cmd The new command state.
     * @private
     */
    private setState(cmd: Command) {
        const now = Date.now();
        // If no change, do nothing
        if (this.lastState === cmd) return;

        if (!cmd.idle) {
            // active commands respect cooldown
            if (now - this.lastCommandAt < this.cooldown) return;
            this.lastCommandAt = now;
        }

        this.lastState = cmd;
        try { this.callback(cmd); } catch (e) { /* swallow callback errors */ }
    }

    // Hilfsfunktion: berechnet Winkel (in Grad) am Punkt b zwischen a-b-c
    private computeAngleDeg(a: {x:number,y:number}, b: {x:number,y:number}, c: {x:number,y:number}) {
        const v1x = a.x - b.x;
        const v1y = a.y - b.y;
        const v2x = c.x - b.x;
        const v2y = c.y - b.y;
        const dot = v1x * v2x + v1y * v2y;
        const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
        const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
        if (mag1 === 0 || mag2 === 0) return 180; // fallback: assume straight
        let cos = dot / (mag1 * mag2);
        cos = Math.max(-1, Math.min(1, cos));
        return Math.acos(cos) * (180 / Math.PI);
    }

    private onResults(results: Results) {
        // Forward full results to visualizer if provided (for drawing landmarks/overlays)
        if (this.visualizer) {
            try { this.visualizer(results); } catch (e) { /* swallow visualizer errors */ }
        }

        // Default to idle; only switch to an active command when detected
        let cmd: Command = {
            idle: false,
            hipLeft: false,
            hipRight: false,
            hipDeltaX: 0,
            hipX: 0,
            leftHandUp: false,
            rightHandUp: false,
            leanLeft: false,
            leanRight: false,
            bothHandsUp: false,
            squat: false
        };

        if (results.poseLandmarks) {
            if (!this.initialLandmarks) {
                this.initialLandmarks = results;
            }

            const pose = results.poseLandmarks;
            const leftHip = pose[23];
            const rightHip = pose[24];
            const head = pose[0];

            if (leftHip && rightHip) {
                // Torso x: mittlerer Punkt zwischen beiden Hüften
                const initialLeftHip = this.initialLandmarks.poseLandmarks[23];
                const initialRightHip = this.initialLandmarks.poseLandmarks[24];
                const torsoX = (leftHip.x + rightHip.x) / 2;
                const initialTorsoX = (initialLeftHip.x + initialRightHip.x) / 2;

                // smoothing
                this.smoothTorsoX = this.alpha * torsoX + (1 - this.alpha) * this.smoothTorsoX;

                const center = 0.5;
                const dx = this.smoothTorsoX - center;

                // simple thresholds
                if (dx < -0.12) {
                    cmd.hipLeft = true;
                } else if (dx > 0.12) {
                    cmd.hipRight = true;
                }
                cmd.hipDeltaX = this.smoothTorsoX - initialTorsoX;
                cmd.hipX = this.smoothTorsoX;
            }

            // wrists vs shoulders for rotate/drop
            const leftWrist = pose[15];
            const rightWrist = pose[16];
            const leftShoulder = pose[11];
            const rightShoulder = pose[12];
            const headY = head && head.y;

            // drop: both hands above head
            const handsAboveHead = leftWrist && rightWrist && headY !== undefined && leftWrist.y < headY && rightWrist.y < headY;
            if (handsAboveHead) {
                cmd.bothHandsUp = true;
            }

            // squat-detection
            // Wir erkennen Squats, indem wir die Hüft-Vertikalposition gegen eine initiale (stehende) Referenz betrachten
            // und zusätzlich den Knie-Winkel messen. Das reduziert Fehlalarme bei kleinen Hüftbewegungen.
            try {
                const leftKnee = pose[25];
                const rightKnee = pose[26];
                const leftAnkle = pose[27];
                const rightAnkle = pose[28];

                // setze initiale Hüft-Y (nur einmal, adaptiv wenn nötig)
                if (this.initialHipYAvg === null) {
                    if (this.initialLandmarks && this.initialLandmarks.poseLandmarks) {
                        const il = this.initialLandmarks.poseLandmarks;
                        if (il[23] && il[24]) {
                            this.initialHipYAvg = (il[23].y + il[24].y) / 2;
                        }
                    }
                }

                let rawDetected = false;

                if (leftHip && rightHip && this.initialHipYAvg !== null && leftKnee && rightKnee && leftAnkle && rightAnkle) {
                    const currentHipYAvg = (leftHip.y + rightHip.y) / 2;
                    const hipDrop = currentHipYAvg - this.initialHipYAvg; // positive when hips moved down

                    // Knie-Winkel (in Grad) am Kniepunkt: hip - knee - ankle
                    const kneeAngleLeft = this.computeAngleDeg(leftHip, leftKnee, leftAnkle);
                    const kneeAngleRight = this.computeAngleDeg(rightHip, rightKnee, rightAnkle);
                    const kneeAngleAvg = (kneeAngleLeft + kneeAngleRight) / 2;

                    // adaptive threshold: skaliert etwas mit Schulter-Breite, aber wir verwenden feste sinnvolle Grenzen
                    const hipDropThreshold = 0.06; // ~6% des Bildes nach unten
                    const kneeAngleThreshold = 150; // Kniewinkel kleiner als 150° => Knie deutlich gebeugt

                    // require both conditions or a strong one: hip drop + knee bend
                    if (hipDrop > hipDropThreshold && kneeAngleAvg < 165) {
                        rawDetected = true;
                    } else if (kneeAngleAvg < kneeAngleThreshold) {
                        rawDetected = true;
                    } else if (hipDrop > hipDropThreshold * 1.5) {
                        // strong hip drop alone is enough
                        rawDetected = true;
                    }

                    // adapt initial hip Y slowly when user is clearly standing (not squatting)
                    const standingHipDelta = Math.abs(currentHipYAvg - this.initialHipYAvg);
                    if (!rawDetected && standingHipDelta < 0.01) {
                        // small low-pass to follow slow camera/user shifts
                        this.initialHipYAvg = 0.9 * this.initialHipYAvg + 0.1 * currentHipYAvg;
                    }
                }

                // Debounce logic: require sustained detection to flip state
                const now = Date.now();
                if (rawDetected) {
                    this.squatReleaseAt = null;
                    if (this.squatCandidateAt === null) this.squatCandidateAt = now;
                    if (!this.squatState && this.squatCandidateAt !== null && (now - this.squatCandidateAt) >= this.squatHoldMs) {
                        this.squatState = true;
                        // reset candidate timestamp to avoid re-triggering
                        this.squatCandidateAt = null;
                    }
                } else {
                    // raw not detected
                    this.squatCandidateAt = null;
                    if (this.squatState) {
                        if (this.squatReleaseAt === null) this.squatReleaseAt = now;
                        if ((now - this.squatReleaseAt) >= this.squatReleaseMs) {
                            this.squatState = false;
                            this.squatReleaseAt = null;
                        }
                    }
                }

                // set final command based on debounced state
                if (this.squatState) cmd.squat = true;
            } catch (e) {
                // falls Berechnung fehlschlägt, ignorieren
            }

            // rotate right: right hand raised above shoulder
            if (rightWrist && rightShoulder && rightWrist.y < rightShoulder.y - 0.05) {
                cmd.rightHandUp = true;
            }

            // rotate left: left hand raised above shoulder
            if (leftWrist && leftShoulder && leftWrist.y < leftShoulder.y - 0.05) {
                cmd.leftHandUp = true;
            }

            // detect leaning by comparing shoulder y-positions
            const distanceShoulders = leftShoulder && rightShoulder ? Math.abs(leftShoulder.x - rightShoulder.x) : Infinity;
            const leanThreshold = 0.9 * distanceShoulders;
            // lean left
            if (leftShoulder && rightShoulder && leftShoulder.y > rightShoulder.y + leanThreshold) {
                cmd.leanLeft = true;
            }

            // lean right
            if (leftShoulder && rightShoulder && rightShoulder.y > leftShoulder.y + leanThreshold) {
                cmd.leanRight = true;
            }
        }

        // If there were no landmarks or no command recognized, cmd is 'idle'
        if (!cmd.hipLeft && !cmd.hipRight && !cmd.leftHandUp && !cmd.rightHandUp && !cmd.bothHandsUp && !cmd.squat) {
            cmd.idle = true;
        }
        this.setState(cmd);
    }
}
