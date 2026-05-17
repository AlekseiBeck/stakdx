/**
 * Stakd Icon Generator
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

  // Dark background
  ctx.fillStyle = '#0a0f1e';
  ctx.fillRect(0, 0, size, size);

  // Rounded corners effect (draw inset rounded rect)
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
  ctx.fillStyle = '#0d1529';
  ctx.fill();

  // Blue glow gradient in center
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.4);
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
  gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Draw a simple candlestick chart symbol
  const unit = size / 12;
  const barWidth = unit * 1.1;
  const centerX = size / 2;
  const centerY = size / 2;

  // Three candlesticks
  const candles = [
    { x: centerX - unit * 2.8, bodyY: centerY + unit * 0.5, bodyH: unit * 2.2, wickTop: unit * 3.5, wickBot: unit * 1.2, bull: false },
    { x: centerX, bodyY: centerY - unit * 0.5, bodyH: unit * 2.8, wickTop: unit * 1.8, wickBot: unit * 3.5, bull: true },
    { x: centerX + unit * 2.8, bodyY: centerY - unit * 1.5, bodyH: unit * 2.4, wickTop: unit * 0.8, wickBot: unit * 2.8, bull: true },
  ];

  for (const c of candles) {
    const color = c.bull ? '#10b981' : '#ef4444';
    const bodyTop = centerY - c.bodyY + (c.bull ? 0 : c.bodyH);

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, unit * 0.2);
    ctx.beginPath();
    ctx.moveTo(c.x, centerY - c.wickTop);
    ctx.lineTo(c.x, centerY + c.wickBot);
    ctx.stroke();

    // Body
    ctx.fillStyle = color;
    const by = c.bull ? centerY - c.bodyY - c.bodyH : centerY - c.bodyY;
    ctx.fillRect(c.x - barWidth / 2, by, barWidth, c.bodyH);
  }

  // "AI" text at bottom
  const fontSize = Math.max(8, size * 0.12);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = '#3b82f6';
  ctx.textAlign = 'center';
  ctx.fillText('AI', centerX, centerY + unit * 4.2);

  return canvas.toBuffer('image/png');
}

SIZES.forEach(size => {
  const buffer = drawIcon(size);
  const outPath = path.join(__dirname, `icon-${size}.png`);
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated: icon-${size}.png`);
});

console.log('\nAll icons generated! You can now run your PWA.');
