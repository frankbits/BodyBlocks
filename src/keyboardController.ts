export type Command = 'left' | 'right' | 'rotate' | 'drop' | 'softDropStart' | 'softDropStop' | 'idle';
type CommandCallback = (cmd: Command) => void;

export class KeyboardController {
  private callback: CommandCallback;
  private running = false;

  // keydown: start discrete actions and start soft-drop on ArrowDown
  private keydownHandler = (e: KeyboardEvent) => {
    // ignore repeated events while key is held for discrete inputs
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
      case ' ': // Space -> hard drop
      case 'Spacebar': // older browsers
        cmd = 'drop';
        break;
      case 'ArrowDown':
        // ArrowDown starts soft-drop while held
        cmd = 'softDropStart';
        break;
      default:
        break;
    }

    if (cmd) {
      e.preventDefault();
      try { this.callback(cmd); } catch (err) { /* swallow */ }
    }
  };

  // keyup: stop soft-drop when ArrowDown released
  private keyupHandler = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      try { this.callback('softDropStop'); } catch (err) { /* swallow */ }
    }
  };

  constructor(callback: CommandCallback) {
    this.callback = callback;
  }

  start() {
    if (this.running) return;
    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('keyup', this.keyupHandler);
    this.running = true;
  }

  stop() {
    if (!this.running) return;
    window.removeEventListener('keydown', this.keydownHandler);
    window.removeEventListener('keyup', this.keyupHandler);
    this.running = false;
  }
}
