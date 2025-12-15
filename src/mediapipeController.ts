// Datei: src/mediapipeController.ts
import { Holistic, type Results } from '@mediapipe/holistic';
import { Camera } from '@mediapipe/camera_utils';

type Command = 'left' | 'right' | 'rotate' | 'drop';
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

    // Added an optional third parameter to receive raw Results for visualization
    constructor(videoElement: HTMLVideoElement, callback: CommandCallback, visualizer?: VisualizerCallback) {
        this.callback = callback;
        this.visualizer = visualizer;
        this.holistic = new Holistic({
            // Use local node_modules copy in dev, and the copied /mediapipe/ path in production builds.
            locateFile: (file) => {
                try {
                    const isProd = (import.meta as any)?.env?.PROD;
                    if (isProd) {
                        const prodPath = `/mediapipe/${file}`;
                        // eslint-disable-next-line no-console
                        console.debug('[Mediapipe] locateFile (prod) ->', prodPath);
                        return prodPath;
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

    private emit(cmd: Command) {
        const now = Date.now();
        if (now - this.lastCommandAt < this.cooldown) return;
        this.lastCommandAt = now;
        this.callback(cmd);
    }

    private onResults(results: Results) {
        // Forward full results to visualizer if provided (for drawing landmarks/overlays)
        if (this.visualizer) {
            try { this.visualizer(results); } catch (e) { /* swallow visualizer errors */ }
        }

        if (!results.poseLandmarks) return;

        // Torso x: mittlerer Punkt zwischen beiden Hüften/Schultern
        const leftHip = results.poseLandmarks[23];
        const rightHip = results.poseLandmarks[24];
        const torsoX = (leftHip.x + rightHip.x) / 2;

        // smoothing
        this.smoothTorsoX = this.alpha * torsoX + (1 - this.alpha) * this.smoothTorsoX;

        const center = 0.5;
        const dx = this.smoothTorsoX - center;

        // simple thresholds
        if (dx < -0.12) this.emit('left');
        else if (dx > 0.12) this.emit('right');

        // wrists vs shoulders for rotate/drop
        const leftWrist = results.poseLandmarks[15];
        const rightWrist = results.poseLandmarks[16];
        // const leftShoulder = results.poseLandmarks[11];
        const rightShoulder = results.poseLandmarks[12];
        const leftHipY = leftHip.y;
        const headY = results.poseLandmarks[0].y;

        // rotate: right hand raised above shoulder
        if (rightWrist && rightShoulder && rightWrist.y < rightShoulder.y - 0.05) {
            this.emit('rotate');
        }

        // drop: both hands above head OR squat (hips low)
        const handsAboveHead = leftWrist && rightWrist && leftWrist.y < headY && rightWrist.y < headY;
        const squat = leftHipY > 0.7 && rightHip.y > 0.7;
        if (handsAboveHead || squat) {
            this.emit('drop');
        }
    }
}
