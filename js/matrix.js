'use strict';

// 5x7-Punktmatrix-Schrift für das LED-Theme. '1' = leuchtende LED, '0' = unbeleuchtete.
const MATRIX_GLYPHS = {
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  '♯': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  '♭': ['10000', '10000', '10110', '11001', '10001', '10010', '11100'],
  ',': ['00', '00', '00', '00', '11', '01', '10'],
  '.': ['00', '00', '00', '00', '00', '11', '11'],
  '–': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Zeichnet text als LED-Punkte in die SVG-Gruppe g.
 * (x, y) = linke obere Ecke bzw. bei anchor 'middle' die obere Mitte.
 * @returns {{width:number, height:number}} in SVG-Einheiten
 */
function drawMatrix(g, text, { x = 0, y = 0, cell = 5, anchor = 'start' } = {}) {
  const glyphs = [...text].map((ch) => MATRIX_GLYPHS[ch] || MATRIX_GLYPHS[' ']);
  const cols = glyphs.reduce((sum, gl) => sum + gl[0].length, 0) + Math.max(0, glyphs.length - 1);
  const width = cols * cell;
  const height = 7 * cell;
  let left = anchor === 'middle' ? x - width / 2 : x;

  g.replaceChildren();
  const r = cell * 0.38;
  for (const gl of glyphs) {
    gl.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', left + rx * cell + cell / 2);
        c.setAttribute('cy', y + ry * cell + cell / 2);
        c.setAttribute('r', r);
        c.setAttribute('class', bit === '1' ? 'led-on' : 'led-off');
        g.append(c);
      });
    });
    left += (gl[0].length + 1) * cell;
  }
  return { width, height };
}

/** Füllt ein ganzes <svg> mit text und passt die viewBox an. */
function drawMatrixSvg(svg, text, cell = 6) {
  let g = svg.querySelector('g');
  if (!g) {
    g = document.createElementNS(SVG_NS, 'g');
    svg.append(g);
  }
  const { width, height } = drawMatrix(g, text, { cell });
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
}
