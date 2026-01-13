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

// export type Input = 'left' | 'right' | 'rotate' | 'drop' | null; // removed unused alias

export class TetrisGame {
    private cols = 10;
    private rows = 20;
    private grid: Cell[][];
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private running = false;
    private dropInterval = 1000; // ms
    private lastDrop = 0;

    // training / visualization helpers
    private preventNextSpawn = false; // when true, resetPiece will not spawn a new piece
    private targetPieceIndex: number | null = null;
    private targetRotation: number | null = null;
    private targetCol: number | null = null; // kept for backward compatibility

    /**
     * Set a visual target: optionally override pieceIndex, rotation and column for the ghost preview.
     */
    public setTargetSpec(spec: { pieceIndex?: number | null; rotation?: number | null; col?: number | null }) {
        if (spec.pieceIndex !== undefined) this.targetPieceIndex = spec.pieceIndex === null ? null : spec.pieceIndex;
        if (spec.rotation !== undefined) this.targetRotation = spec.rotation === null ? null : spec.rotation;
        if (spec.col !== undefined) this.targetCol = spec.col === null ? null : Math.max(0, Math.min(this.cols - 1, Math.floor(spec.col)));
        this.render();
    }

    /**
     * Backwards-compatible setter for column-only targets
     */
    public setTargetColumn(col: number | null) {
        this.setTargetSpec({ col });
    }

    /**
     * Prevent the next automatic piece spawn (used to stop simulation spawning after goal)
     */
    public suppressNextSpawn(suppress = true) {
        this.preventNextSpawn = suppress;
    }

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

    // --- line clear animation state ---
    private clearingRows: number[] = [];
    private clearingStart = 0; // timestamp when animation started
    private clearingDuration = 400; // ms
    private clearingAnimating = false;
    private pendingClearedCount = 0;

    // external hook to notify when the game ends
    public onGameOver?: () => void;

    // new hook: notify when a piece was locked into the field
    public onPieceLocked?: (info: { pieceIndex: number; rotation: number; finalCol: number; finalRow: number }) => void;

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

    /**
     * Spawn a specific piece (useful for training). If pieceIndex is null, choose random.
     */
    public spawnPiece(pieceIndex: number | null = null, rotation: number = 0) {
        if (pieceIndex === null) {
            this.pieceIndex = Math.floor(Math.random() * TETROMINOS.length);
        } else {
            this.pieceIndex = pieceIndex % TETROMINOS.length;
        }
        this.pieceMatrix = TETROMINOS[this.pieceIndex];
        this.rotation = rotation % this.pieceMatrix.length;
        this.pieceRow = 0;
        this.pieceCol = Math.floor((this.cols - this.currentMatrix()[0].length) / 2);

        // if spawn collides -> game over
        if (!this.tryMove(this.pieceRow, this.pieceCol, this.rotation)) {
            this.gameOver = true;
            this.running = false;
            if (this.onGameOver) this.onGameOver();
        }
    }

    /**
     * Return a small description of the currently active piece (index, rotation and col)
     */
    public getCurrentPieceInfo() {
        const mat = this.currentMatrix();
        return {
            pieceIndex: this.pieceIndex,
            rotation: this.rotation,
            pieceCol: this.pieceCol,
            pieceRow: this.pieceRow,
            pieceWidth: mat[0].length,
        };
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

    /**
     * Move piece toward target column
     * @param col Target column index (0-based: 0 - 9)
     */
    moveToCol(col: number) {
        // compute leftmost occupied column within the piece matrix
        const mat = this.currentMatrix();
        let leftOffset = 0;
        columns: for (let c = 0; c < mat[0].length; c++) {
            for (let r = 0; r < mat.length; r++) {
                if (mat[r][c] !== 0) {
                    leftOffset = c;
                    break columns;
                }
            }
        }
        // desired pieceCol so that the leftmost occupied cell lands on target column
        const targetPieceCol = col - leftOffset;

        // move piece in direction of target column
        if (targetPieceCol < this.pieceCol) {
            this.moveLeft()
        } else if (targetPieceCol > this.pieceCol) {
            this.moveRight()
        }
    }

    rotate(direction: 'clockwise' | 'counterclockwise' = 'clockwise') {
        const newRot = (this.rotation + (direction === 'clockwise' ? 1 : -1) + this.pieceMatrix.length) % this.pieceMatrix.length;
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

        // if we're animating a line clear, advance animation and finalize when done
        if (this.clearingAnimating) {
            const elapsed = now - this.clearingStart;
            if (elapsed >= this.clearingDuration) {
                this.finalizeClearLines();
            }
            // during animation we pause gravity/steps
            this.render();
            requestAnimationFrame(this.loop.bind(this));
            return;
        }

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

    // --- Auto-walk helper for training (internal) ---
    private _autoWalkHandle: number | null = null;
    private _autoWalkDir: 1 | -1 = 1;

    public startAutoWalk(intervalMs = 200) {
        this.stopAutoWalk();
        this._autoWalkDir = 1;
        this._autoWalkHandle = window.setInterval(() => {
            // compute bounds based on current piece width
            const mat = this.currentMatrix();
            const pieceWidth = mat[0].length;
            const minCol = 0;
            const maxCol = Math.max(0, this.cols - pieceWidth);

            if (this.pieceCol <= minCol) this._autoWalkDir = 1;
            if (this.pieceCol >= maxCol) this._autoWalkDir = -1;

            let moved = this.autoStep(this._autoWalkDir);
            if (!moved) {
                // try opposite once
                this._autoWalkDir = -this._autoWalkDir as 1 | -1;
                this.autoStep(this._autoWalkDir);
            }
        }, intervalMs);
    }

    public stopAutoWalk() {
        if (this._autoWalkHandle) {
            clearInterval(this._autoWalkHandle);
            this._autoWalkHandle = null;
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
        // if suppression is active, skip spawning a new active piece
        if (this.preventNextSpawn) {
            // keep running=false (caller should stop loop) and do not create a new active piece
            this.running = false;
            return;
        }

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

    /**
     * Get the current piece matrix in its current rotation
     * @private
     */
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

        // notify external listeners about the locked piece before clearing lines / resetting
        try {
            if (this.onPieceLocked) {
                this.onPieceLocked({ pieceIndex: this.pieceIndex, rotation: this.rotation, finalCol: this.pieceCol, finalRow: this.pieceRow });
            }
        } catch (e) { /* swallow listener errors */ }

        this.clearLines();
        this.resetPiece();
    }

    private clearLines() {
        // detect full rows and start a short animation before actually removing them
        const rowsToClear: number[] = [];
        for (let r = 0; r < this.rows; r++) {
            if (this.grid[r].every(cell => cell !== 0)) rowsToClear.push(r);
        }
        if (rowsToClear.length === 0) return;
        // start animation
        this.clearingRows = rowsToClear;
        this.clearingStart = performance.now();
        this.clearingAnimating = true;
        this.pendingClearedCount = rowsToClear.length;
    }

    private finalizeClearLines() {
        // remove the rows that were flagged for clearing
        const toClearSet = new Set(this.clearingRows);
        const newGrid: number[][] = [];
        for (let r = 0; r < this.rows; r++) {
            if (!toClearSet.has(r)) newGrid.push(this.grid[r]);
        }
        // add empty rows to top
        for (let i = 0; i < this.pendingClearedCount; i++) {
            newGrid.unshift(Array(this.cols).fill(0));
        }
        this.grid = newGrid;

        const cleared = this.pendingClearedCount;
        if (cleared > 0) {
            this.lines += cleared;
            this.score += [0, 40, 100, 300, 1200][cleared] || 0;
            this.dropInterval = Math.max(100, 1000 - Math.floor(this.lines / 10) * 50);
        }

        // reset animation state
        this.clearingRows = [];
        this.clearingAnimating = false;
        this.pendingClearedCount = 0;
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

        // draw optional simulated target piece (ghost) after background so it remains visible
        if (this.targetCol !== null || this.targetPieceIndex !== null || this.targetRotation !== null) {
            // decide which matrix & rotation to use for the ghost
            let mat: Matrix[];
            let rotIndex = 0;
            if (this.targetPieceIndex !== null && TETROMINOS[this.targetPieceIndex]) {
                mat = TETROMINOS[this.targetPieceIndex];
                rotIndex = this.targetRotation !== null ? this.targetRotation % mat.length : 0;
            } else {
                if (this.pieceMatrix && this.pieceMatrix.length) {
                    mat = this.pieceMatrix;
                } else {
                    // wrap single-matrix into an array to keep types consistent
                    mat = [this.currentMatrix()];
                }
                rotIndex = this.targetRotation !== null ? this.targetRotation % mat.length : this.rotation % mat.length;
            }

            const curMat = mat[rotIndex % mat.length];

            // compute leftOffset for this matrix
            let leftOffset = 0;
            columns: for (let c = 0; c < curMat[0].length; c++) {
                for (let r = 0; r < curMat.length; r++) {
                    if (curMat[r][c] !== 0) {
                        leftOffset = c;
                        break columns;
                    }
                }
            }

            const targetCol = this.targetCol !== null ? this.targetCol : this.pieceCol + leftOffset;
            let targetPieceCol = targetCol - leftOffset;
            targetPieceCol = Math.max(0, Math.min(this.cols - curMat[0].length, targetPieceCol));

            // simulate falling to find landing row
            let simRow = this.pieceRow;
            if (!this.tryMove(simRow, targetPieceCol, rotIndex)) simRow = 0;
            while (this.tryMove(simRow + 1, targetPieceCol, rotIndex)) {
                simRow++;
                if (simRow > this.rows) break;
            }

            // draw ghost piece with low alpha
            this.ctx.save();
            this.ctx.globalAlpha = 0.35;
            for (let r = 0; r < curMat.length; r++) {
                for (let c = 0; c < curMat[r].length; c++) {
                    if (curMat[r][c] !== 0) {
                        const gr = simRow + r;
                        const gc = targetPieceCol + c;
                        if (gr >= 0 && gr < this.rows && gc >= 0 && gc < this.cols) {
                            this.ctx.fillStyle = COLORS[curMat[r][c]] || '#999';
                            this.ctx.fillRect(gc * cellW + 1, gr * cellH + 1, cellW - 2, cellH - 2);
                            this.ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                            this.ctx.strokeRect(gc * cellW + 1, gr * cellH + 1, cellW - 2, cellH - 2);
                        }
                    }
                }
            }
            this.ctx.restore();
        }

        // compute animation progress if any
        let progress = 0;
        if (this.clearingAnimating) {
            progress = Math.min(1, (performance.now() - this.clearingStart) / this.clearingDuration);
        }

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const val = this.grid[r][c];
                if (val !== 0) {
                    // if this row is being cleared, fade the row based on progress
                    if (this.clearingAnimating && this.clearingRows.includes(r)) {
                        this.ctx.save();
                        this.ctx.globalAlpha = 1 - progress; // fade out
                        this.drawCell(c, r, val, cellW, cellH);
                        this.ctx.restore();
                    } else {
                        this.drawCell(c, r, val, cellW, cellH);
                    }
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

    /**
     * Try to move the active piece one column to the left (-1) or right (+1).
     * Returns true if movement succeeded, false otherwise.
     */
    public autoStep(dir: -1 | 1): boolean {
        const candidateCol = this.pieceCol + dir;
        if (this.tryMove(this.pieceRow, candidateCol, this.rotation)) {
            this.pieceCol = candidateCol;
            this.render();
            return true;
        }
        return false;
    }
}
