import Phaser from "phaser";

// Set to true to skip player selection and use a random color
const SKIP_PLAYER_SELECT = true;

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    // Load pink player sprites
    this.load.image("pinkStill", "/assets/pinkStill.svg");
    this.load.image("pinkWalk1", "/assets/pinkWalk1.svg");
    this.load.image("pinkWalk2", "/assets/pinkWalk2.svg");

    // Load green player sprites
    this.load.image("greenStill", "/assets/greenStill.svg");
    this.load.image("greenWalk1", "/assets/greenWalk1.svg");
    this.load.image("greenWalk2", "/assets/greenWalk2.svg");

    // Load blue player sprites
    this.load.image("blueStill", "/assets/blueStill.svg");
    this.load.image("blueWalk1", "/assets/blueWalk1.svg");
    this.load.image("blueWalk2", "/assets/blueWalk2.svg");

    // Load wall sprite
    this.load.image("wall", "/assets/wall.svg");

    // Create tile texture
    this.createTileTexture();
  }

  create() {
    if (SKIP_PLAYER_SELECT) {
      // Skip player selection and use a random color
      const colors: Array<"pink" | "green" | "blue"> = [
        "pink",
        "green",
        "blue",
      ];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      this.registry.set("playerColor", randomColor);
      this.scene.start("GameScene");
    } else {
      // Start player selection scene
      this.scene.start("PlayerSelectScene");
    }
  }

  private createTileTexture() {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x2d2d44, 1);
    graphics.fillRect(0, 0, 32, 32);
    graphics.lineStyle(1, 0x1a1a2e, 0.5);
    graphics.strokeRect(0, 0, 32, 32);
    graphics.generateTexture("tile", 32, 32);
    graphics.destroy();
  }
}
