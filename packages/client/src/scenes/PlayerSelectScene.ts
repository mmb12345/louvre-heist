import Phaser from 'phaser';

export class PlayerSelectScene extends Phaser.Scene {
  private selectedColor: 'pink' | 'green' | 'blue' | null = null;

  constructor() {
    super({ key: 'PlayerSelectScene' });
  }

  create() {
   this.sound.play("boot-scene-bgm", { loop: true, volume: 0.3 })

    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    // Title
    this.add.text(centerX, centerY - 200, 'SELECT YOUR PLAYER', {
      fontSize: '48px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Color selection buttons
    const colors = [
      { name: 'pink', color: '#FF00EA', x: centerX - 200 },
      { name: 'green', color: '#00EA50', x: centerX },
      { name: 'blue', color: '#4169E1', x: centerX + 200 },
    ];

    colors.forEach(({ name, color, x }) => {
      // Create circular button
      const circle = this.add.circle(x, centerY, 60, parseInt(color.replace('#', '0x')));
      circle.setInteractive({ useHandCursor: true });

      // Add label
      this.add.text(x, centerY + 100, name.toUpperCase(), {
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      // Hover effects
      circle.on('pointerover', () => {
        circle.setScale(1.1);
      });

      circle.on('pointerout', () => {
        circle.setScale(1);
      });

      // Click handler
      circle.on('pointerdown', () => {
        this.selectedColor = name as 'pink' | 'green' | 'blue';
        this.startGame();
      });
    });

    // Instructions
    this.add.text(centerX, centerY + 180, 'Click a color to start!', {
      fontSize: '20px',
      color: '#aaaaaa',
    }).setOrigin(0.5);
  }

  private startGame() {
    if (this.selectedColor) {
      // Stop the boot-scene-bgm before transitioning
      this.sound.stopByKey('boot-scene-bgm');

      // Pass the selected color to GameScene via registry
      this.registry.set('playerColor', this.selectedColor);
      this.scene.start('GameScene');
    }
  }

  shutdown() {
    // Make sure boot-scene-bgm stops if scene is shut down by other means
    this.sound.stopByKey('boot-scene-bgm');
  }
}
