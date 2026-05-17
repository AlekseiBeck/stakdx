/**
 * Stakdx Icon Generator
 * Run this once to create all required PWA icons:
 *   node generate-icons.js
 *
 * Requires: npm install canvas (one-time, not in your app bundle)
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZES = [72, 96, 128, 144, 152, 180, 192, 512];

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Dark background fill
  ctx.fillStyle = '#0c0c0d';
  ctx.fillRect(0, 0, size, size);

  // Rounded rect background (iOS-style)
  const radius = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = '#111112';
  ctx.fill();

  // Amber radial glow
  const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.45);
  glow.addColorStop(0, 'rgba(245, 158, 11, 0.18)');
  glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // Draw "Sx" logotype in amber
  const fontSize = Math.round(size * 0.42);
  ctx.font = `900 ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Subtle shadow
  ctx.shadowColor = 'rgba(245, 158, 11, 0.5)';
  ctx.shadowBlur = size * 0.08;

  ctx.fillStyle = '#f59e0b';
  ctx.fillText('Sx', size / 2, size / 2);

  ctx.shadowBlur = 0;

  return canvas.toBuffer('image/png');
}

SIZES.forEach(size => {
  const buffer = drawIcon(size);
  const outPath = path.join(__dirname, `icon-${size}.png`);
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated: icon-${size}.png`);
});

console.log('\nAll icons generated! You can now run your PWA.');
