export type Command = 'left' | 'right' | 'rotate' | 'drop' | 'idle';
type CommandCallback = (cmd: Command) => void;

export class KeyboardController {
  private callback: CommandCallback;
  private running = false;

  private keydownHandler = (e: KeyboardEvent) => {
    // ignore repeated events while key is held
    if (e.repeat) return;

    let cmd: Command | null = null;
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        cmd = 'left';
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        cmd = 'right';
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        cmd = 'rotate';
        break;
      case ' ': // Space
      case 'Spacebar': // older browsers
      case 'ArrowDown':
        cmd = 'drop';
        break;
      default:
        break;
    }

    if (cmd) {
      e.preventDefault();
      try { this.callback(cmd); } catch (err) { /* swallow */ }
    }
  };

  constructor(callback: CommandCallback) {
    this.callback = callback;
  }

  start() {
    if (this.running) return;
    window.addEventListener('keydown', this.keydownHandler);
    this.running = true;
  }

  stop() {
    if (!this.running) return;
    window.removeEventListener('keydown', this.keydownHandler);
    this.running = false;
  }
}

