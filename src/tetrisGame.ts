// Datei: src/tetrisGame.ts
export type Cell = number; // 0 = leer, >0 = Farbe/ID

export class TetrisGame {
    private cols = 10;
    private rows = 20;
    private grid: Cell[][];
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private running = false;
    private dropInterval = 1000;
    private lastDrop = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.canvas.width = this.cols * 24;
        this.canvas.height = this.rows * 24;
        this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
    }

    start() {
        this.running = true;
        this.lastDrop = performance.now();
        requestAnimationFrame(this.loop.bind(this));
    }

    stop() {
        this.running = false;
    }

    // These methods are called by MediapipeController
    moveLeft() { /* implement piece movement */ }
    moveRight() { /* implement piece movement */ }
    rotate() { /* implement rotation */ }
    drop() { /* implement hard drop */ }

    private loop(now: number) {
        if (!this.running) return;
        if (now - this.lastDrop > this.dropInterval) {
            this.lastDrop = now;
            // advance piece down
        }
        this.render();
        requestAnimationFrame(this.loop.bind(this));
    }

    render() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);
        // draw grid
        const cellW = w / this.cols;
        const cellH = h / this.rows;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[r][c] !== 0) {
                    this.ctx.fillStyle = '#3498db';
                    this.ctx.fillRect(c * cellW, r * cellH, cellW - 1, cellH - 1);
                } else {
                    this.ctx.strokeStyle = '#222';
                    this.ctx.strokeRect(c * cellW, r * cellH, cellW, cellH);
                }
            }
        }
    }
}
