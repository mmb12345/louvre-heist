// Name generator for heist-themed player names

const FIRST_NAMES = [
  'Ace', 'Remy', 'Jules', 'Max', 'Ruby', 'Jack', 'Scarlett',
  'Chase', 'Vex', 'Dash', 'Lux', 'Blaze', 'Shadow', 'Fox',
  'Sterling', 'Rogue', 'Nova', 'Atlas', 'Phoenix', 'Cipher'
];

const LAST_NAMES = [
  'Blackwell', 'Silver', 'Diamond', 'Steele', 'Crown',
  'Phantom', 'Swift', 'Vault', 'Midnight', 'Cipher',
  'Daring', 'Sly', 'Lockhart', 'Fortune', 'Slick'
];

const TITLES = [
  'the Great', 'the Bold', 'the Swift', 'the Clever',
  'the Magnificent', 'the Daring', 'the Silent', 'the Shadow',
  'the Infamous', 'the Legendary', 'the Mastermind', 'the Fox',
  'the Phantom', 'the Ace', 'the Slick', 'the Brilliant',
  'the Notorious', 'the Cunning', 'the Elusive', 'the Smooth'
];

/**
 * Generates a random heist-themed player name with color and optional title
 * @param color - Player color (pink, green, blue)
 * @param includeTitle - Whether to include a title (default 30% chance)
 * @returns Generated player name
 */
export function generatePlayerName(
  color: 'pink' | 'green' | 'blue',
  includeTitle: boolean = Math.random() < 0.3
): string {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];

  // Capitalize color for display
  const colorName = color.charAt(0).toUpperCase() + color.slice(1);

  if (includeTitle) {
    const title = TITLES[Math.floor(Math.random() * TITLES.length)];
    return `${colorName} ${firstName} ${title}`;
  }

  return `${colorName} ${firstName}`;
}
