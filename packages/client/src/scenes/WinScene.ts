import Phaser from 'phaser';

export class WinScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WinScene' });
  }

  create() {
    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    // Dark background
    this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x000000, 0.8)
      .setOrigin(0);

    // Title text
    this.add.text(centerX, centerY - 200, 'MISSION SUCCESS', {
      fontSize: '64px',
      color: '#00ff00',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Subtitle text
    this.add.text(centerX, centerY - 130, 'The Crown of Empress Eugénie is yours!', {
      fontSize: '24px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Display the crown in the center (large and prominent)
    this.add.image(centerX, centerY + 30, 'crown').setScale(3);

    // Success message
    this.add.text(centerX, centerY + 200, 'The heist was a success!', {
      fontSize: '28px',
      color: '#ffd700',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Restart instruction
    this.add.text(centerX, centerY + 250, 'Refresh to play again', {
      fontSize: '20px',
      color: '#aaaaaa',
    }).setOrigin(0.5);
  }
}
