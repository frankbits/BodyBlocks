// Datei: src/tetrisGame.ts
export type Cell = number; // 0 = leer, >0 = Farbe/ID

type Matrix = number[][];

const COLORS = [
    '#000000', // 0 = leer (nicht benutzt)
    '#1abc9c', // 1 I
    '#2ecc71', // 2 J
    '#3498db', // 3 L
    '#9b59b6', // 4 O
    '#f1c40f', // 5 S
    '#e67e22', // 6 T
    '#e74c3c', // 7 Z
];

const TETROMINOS: Matrix[][] = [
    // I
    [
        [
            [0, 0, 0, 0],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
        [
            [0, 0, 1, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 0],
            [0, 0, 1, 0],
        ],
    ],
    // J
    [
        [
            [2, 0, 0],
            [2, 2, 2],
            [0, 0, 0],
        ],
        [
            [0, 2, 2],
            [0, 2, 0],
            [0, 2, 0],
        ],
        [
            [0, 0, 0],
            [2, 2, 2],
            [0, 0, 2],
        ],
        [
            [0, 2, 0],
            [0, 2, 0],
            [2, 2, 0],
        ],
    ],
    // L
    [
        [
            [0, 0, 3],
            [3, 3, 3],
            [0, 0, 0],
        ],
        [
            [0, 3, 0],
            [0, 3, 0],
            [0, 3, 3],
        ],
        [
            [0, 0, 0],
            [3, 3, 3],
            [3, 0, 0],
        ],
        [
            [3, 3, 0],
            [0, 3, 0],
            [0, 3, 0],
        ],
    ],
    // O
    [
        [
            [4, 4],
            [4, 4],
        ],
    ],
    // S
    [
        [
            [0, 5, 5],
            [5, 5, 0],
            [0, 0, 0],
        ],
        [
            [0, 5, 0],
            [0, 5, 5],
            [0, 0, 5],
        ],
    ],
    // T
    [
        [
            [0, 6, 0],
            [6, 6, 6],
            [0, 0, 0],
        ],
        [
            [0, 6, 0],
            [0, 6, 6],
            [0, 6, 0],
        ],
        [
            [0, 0, 0],
            [6, 6, 6],
            [0, 6, 0],
        ],
        [
            [0, 6, 0],
            [6, 6, 0],
            [0, 6, 0],
        ],
    ],
    // Z
    [
        [
            [7, 7, 0],
            [0, 7, 7],
            [0, 0, 0],
        ],
        [
            [0, 0, 7],
            [0, 7, 7],
            [0, 7, 0],
        ],
    ],
];

export class TetrisGame {
    private cols = 10;
    private rows = 20;
    private grid: Cell[][];
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private running = false;
    private dropInterval = 1000; // ms
    private lastDrop = 0;

    // piece state
    private pieceIndex = 0; // index into TETROMINOS
    private rotation = 0; // rotation index
    private pieceMatrix: Matrix[] = [];
    private pieceRow = 0;
    private pieceCol = 3; // spawn near middle

    // game state
    private score = 0;
    private lines = 0;
    private gameOver = false;

    // external hook to notify when the game ends
    public onGameOver?: () => void;

    // public getter so callers can check game over state
    public get isGameOver(): boolean {
        return this.gameOver;
    }

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.canvas.width = this.cols * 24;
        this.canvas.height = this.rows * 24;
        this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));

        this.resetPiece();
    }

    start() {
        if (this.gameOver) this.resetGame();
        this.running = true;
        this.lastDrop = performance.now();
        requestAnimationFrame(this.loop.bind(this));
    }

    stop() {
        this.running = false;
    }

    // external controls called by MediapipeController or KeyboardController
    moveLeft() {
        if (this.tryMove(this.pieceRow, this.pieceCol - 1, this.rotation)) this.pieceCol--;
        this.render();
    }

    moveRight() {
        if (this.tryMove(this.pieceRow, this.pieceCol + 1, this.rotation)) this.pieceCol++;
        this.render();
    }

    rotate() {
        const newRot = (this.rotation + 1) % this.pieceMatrix.length;
        // simple wall kicks: try offsets
        const kicks = [0, -1, 1, -2, 2];
        for (const k of kicks) {
            if (this.tryMove(this.pieceRow, this.pieceCol + k, newRot)) {
                this.rotation = newRot;
                this.pieceCol += k;
                break;
            }
        }
        this.render();
    }

    drop() {
        // hard drop to lowest valid row
        while (this.tryMove(this.pieceRow + 1, this.pieceCol, this.rotation)) {
            this.pieceRow++;
        }
        this.lockPiece();
        this.render();
    }

    private loop(now: number) {
        if (!this.running) return;
        if (now - this.lastDrop > this.dropInterval) {
            this.lastDrop = now;
            this.step();
        }
        this.render();
        requestAnimationFrame(this.loop.bind(this));
    }

    private step() {
        if (this.tryMove(this.pieceRow + 1, this.pieceCol, this.rotation)) {
            this.pieceRow++;
        } else {
            this.lockPiece();
        }
    }

    private resetGame() {
        this.grid = Array.from({length: this.rows}, () => Array(this.cols).fill(0));
        this.score = 0;
        this.lines = 0;
        this.gameOver = false;
        this.resetPiece();
    }

    private resetPiece() {
        // choose random piece and rotation
        this.pieceIndex = Math.floor(Math.random() * TETROMINOS.length);
        this.rotation = 0;
        this.pieceMatrix = TETROMINOS[this.pieceIndex];
        this.pieceRow = 0;
        this.pieceCol = Math.floor((this.cols - this.currentMatrix()[0].length) / 2);

        // if spawn collides -> game over
        if (!this.tryMove(this.pieceRow, this.pieceCol, this.rotation)) {
            this.gameOver = true;
            this.running = false;
            // notify external listeners
            if (this.onGameOver) this.onGameOver();
        }
    }

    private currentMatrix(): Matrix {
        return this.pieceMatrix[this.rotation % this.pieceMatrix.length];
    }

    private tryMove(row: number, col: number, rot: number): boolean {
        const mat = this.pieceMatrix[rot % this.pieceMatrix.length];
        for (let r = 0; r < mat.length; r++) {
            for (let c = 0; c < mat[r].length; c++) {
                if (mat[r][c] !== 0) {
                    const gr = row + r;
                    const gc = col + c;
                    if (gc < 0 || gc >= this.cols || gr >= this.rows) return false;
                    if (gr >= 0 && this.grid[gr][gc] !== 0) return false;
                }
            }
        }
        return true;
    }

    private lockPiece() {
        const mat = this.currentMatrix();
        for (let r = 0; r < mat.length; r++) {
            for (let c = 0; c < mat[r].length; c++) {
                if (mat[r][c] !== 0) {
                    const gr = this.pieceRow + r;
                    const gc = this.pieceCol + c;
                    if (gr >= 0 && gr < this.rows && gc >= 0 && gc < this.cols) {
                        this.grid[gr][gc] = mat[r][c];
                    }
                }
            }
        }

        this.clearLines();
        this.resetPiece();
    }

    private clearLines() {
        let cleared = 0;
        for (let r = this.rows - 1; r >= 0; r--) {
            if (this.grid[r].every(cell => cell !== 0)) {
                // remove line
                this.grid.splice(r, 1);
                // add empty line on top
                this.grid.unshift(Array(this.cols).fill(0));
                cleared++;
                r++; // recheck same row index because rows shifted
            }
        }
        if (cleared > 0) {
            this.lines += cleared;
            this.score += [0, 40, 100, 300, 1200][cleared];
            // speed up slightly per cleared line
            this.dropInterval = Math.max(100, 1000 - Math.floor(this.lines / 10) * 50);
        }
    }

    render() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);
        // draw grid
        const cellW = w / this.cols;
        const cellH = h / this.rows;
        // background
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, 0, w, h);

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const val = this.grid[r][c];
                if (val !== 0) {
                    this.drawCell(c, r, val, cellW, cellH);
                } else {
                    // draw faint grid
                    this.ctx.strokeStyle = '#222';
                    this.ctx.strokeRect(c * cellW, r * cellH, cellW, cellH);
                }
            }
        }

        // draw current piece
        const mat = this.currentMatrix();
        for (let r = 0; r < mat.length; r++) {
            for (let c = 0; c < mat[r].length; c++) {
                if (mat[r][c] !== 0) {
                    const gr = this.pieceRow + r;
                    const gc = this.pieceCol + c;
                    if (gr >= 0) this.drawCell(gc, gr, mat[r][c], cellW, cellH);
                }
            }
        }

        // draw score
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '14px sans-serif';
        this.ctx.fillText(`Score: ${this.score}`, 6, 16);
        this.ctx.fillText(`Lines: ${this.lines}`, 6, 34);

        if (this.gameOver) {
            this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
            this.ctx.fillRect(0, h / 2 - 30, w, 60);
            this.ctx.fillStyle = '#fff';
            this.ctx.textAlign = 'center';
            this.ctx.font = '24px sans-serif';
            this.ctx.fillText('Game Over', w / 2, h / 2 + 8);
            this.ctx.textAlign = 'left';
        }
    }

    private drawCell(col: number, row: number, val: number, cellW: number, cellH: number) {
        this.ctx.fillStyle = COLORS[val] || '#999';
        this.ctx.fillRect(col * cellW + 1, row * cellH + 1, cellW - 2, cellH - 2);
        // simple border
        this.ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        this.ctx.strokeRect(col * cellW + 1, row * cellH + 1, cellW - 2, cellH - 2);
    }
}
