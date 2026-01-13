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

            // drop: both hands above head OR squat (hips low)
            const handsAboveHead = leftWrist && rightWrist && headY !== undefined && leftWrist.y < headY && rightWrist.y < headY;
            if (handsAboveHead) {
                cmd.bothHandsUp = true;
            }
            const squat = leftHip && rightHip && rightHip.y > 0.7 && leftHip.y > 0.7;
            if (squat) {
                cmd.squat = true;
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
