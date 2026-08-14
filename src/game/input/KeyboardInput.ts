export type MoveAxis = -1 | 0 | 1;

/**
 * Imperative keyboard / analog listener for the canvas game loop.
 * Attach once; poll axis / one-shots each frame.
 */
export class KeyboardInput {
  private left = false;
  private right = false;
  private analogX = 0;
  private restartQueued = false;
  private boostQueued = false;
  private boostHeld = false;
  private attached = false;

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") {
      this.left = true;
      e.preventDefault();
    } else if (e.code === "ArrowRight" || e.code === "KeyD") {
      this.right = true;
      e.preventDefault();
    } else if (
      e.code === "Space" ||
      e.code === "ArrowUp" ||
      e.code === "KeyW"
    ) {
      if (!e.repeat) this.boostQueued = true;
      e.preventDefault();
    } else if (e.code === "KeyR" || e.code === "Enter") {
      this.restartQueued = true;
      e.preventDefault();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") this.left = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") this.right = false;
  };

  attach() {
    if (this.attached || typeof window === "undefined") return;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.attached = true;
  }

  detach() {
    if (!this.attached || typeof window === "undefined") return;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.attached = false;
    this.analogX = 0;
    this.boostHeld = false;
    this.left = false;
    this.right = false;
  }

  /** -1..1. Analog stick wins over keys when deflected. */
  axis(): number {
    if (Math.abs(this.analogX) > 0.18) return this.analogX;
    if (this.left && !this.right) return -1;
    if (this.right && !this.left) return 1;
    return 0;
  }

  consumeRestart(): boolean {
    if (!this.restartQueued) return false;
    this.restartQueued = false;
    return true;
  }

  consumeBoost(): boolean {
    if (this.boostQueued) {
      this.boostQueued = false;
      return true;
    }
    return this.boostHeld;
  }

  requestRestart() {
    this.restartQueued = true;
  }

  requestBoost() {
    this.boostQueued = true;
  }

  setAnalog(x: number) {
    this.analogX = Math.max(-1, Math.min(1, x));
  }

  setBoostHeld(held: boolean) {
    this.boostHeld = held;
    if (held) this.boostQueued = true;
  }

  setHeldLeft(on: boolean) {
    this.left = on;
  }

  setHeldRight(on: boolean) {
    this.right = on;
  }

  setTouchAxis(axis: MoveAxis) {
    this.left = axis < 0;
    this.right = axis > 0;
  }
}
