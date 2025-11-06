import Phaser from "phaser";

// Set to true to skip player selection and use a random color
const SKIP_PLAYER_SELECT = false;

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    // Load pink player sprites
    this.load.image("pinkStill", "/assets/pinkStill.svg");
    this.load.image("pinkWalk1", "/assets/pinkWalk1.svg");
    this.load.image("pinkWalk2", "/assets/pinkWalk2.svg");
    this.load.image("pinkShoot", "/assets/pinkShoot.svg");

    // Load green player sprites
    this.load.image("greenStill", "/assets/greenStill.svg");
    this.load.image("greenWalk1", "/assets/greenWalk1.svg");
    this.load.image("greenWalk2", "/assets/greenWalk2.svg");
    this.load.image("greenShoot", "/assets/greenShoot.svg");

    // Load blue player sprites
    this.load.image("blueStill", "/assets/blueStill.svg");
    this.load.image("blueWalk1", "/assets/blueWalk1.svg");
    this.load.image("blueWalk2", "/assets/blueWalk2.svg");
    this.load.image("blueShoot", "/assets/blueShoot.svg");

    // Load wall sprite
    this.load.image("wall", "/assets/wall.svg");

    // Load bullet sprite
    this.load.image("bullet", "/assets/bullet.svg");

    // Load sound effects
    this.load.audio("shoot", "/assets/shoot.mp3");
    this.load.audio("crown-picked-up", "/assets/crown-picked-up.mp3");
    this.load.audio("guard-shot", "/assets/guard-shot.mp3");

    // Load background music
    this.load.audio("boot-scene-bgm", "/assets/boot-scene-bgm.mp3");
    this.load.audio("game-scene-bgm", "/assets/game-scene-bgm.mp3");

    // Load room items
    this.load.image("controlRoomComputer", "/assets/controlRoomComputer.svg");

    // Load crown
    this.load.image("crown", "/assets/crown.svg");

    // Load post-it note
    this.load.image("postit", "/assets/postit.svg");

    // Load guard sprites
    this.load.image("guardStill", "/assets/guardStill.svg");
    this.load.image("guardWalk1", "/assets/guardWalk1.svg");
    this.load.image("guardWalk2", "/assets/guardWalk2.svg");
    this.load.image("guardShoot", "/assets/guardShoot.svg");
    this.load.image("guardDead", "/assets/guardDead.svg");

    // Create tile texture
    this.createTileTexture();
  }

  create() {
    // Check if audio is loaded
    console.log("BootScene: Checking audio cache...");
    console.log(
      "boot-scene-bgm exists:",
      this.cache.audio.exists("boot-scene-bgm")
    );

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
