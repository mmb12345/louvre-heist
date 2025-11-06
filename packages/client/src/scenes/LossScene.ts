import Phaser from 'phaser';

export class LossScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LossScene' });
  }

  create() {
    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    // Dark background
    this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x000000, 0.8)
      .setOrigin(0);

    // Title text
    this.add.text(centerX, centerY - 200, 'MISSION FAILED', {
      fontSize: '64px',
      color: '#ff0000',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Subtitle text
    this.add.text(centerX, centerY - 130, 'All agents have been caught', {
      fontSize: '24px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Display the three dead bodies
    const spacing = 150;
    const startX = centerX - spacing;
    const bodyY = centerY + 50;

    // Pink dead body
    this.add.image(startX, bodyY, 'pinkDead').setScale(0.8);

    // Green dead body
    this.add.image(startX + spacing, bodyY, 'greenDead').setScale(0.8);

    // Blue dead body
    this.add.image(startX + spacing * 2, bodyY, 'blueDead').setScale(0.8);

    // Restart instruction
    this.add.text(centerX, centerY + 250, 'Refresh to try again', {
      fontSize: '20px',
      color: '#aaaaaa',
    }).setOrigin(0.5);
  }
}
