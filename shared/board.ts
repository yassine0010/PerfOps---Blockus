import { PlayerColor } from './types.ts';

export const BOARD_SIZE = 20;

export const STARTING_CORNERS: Record<PlayerColor, [number, number]> = {
  YELLOW: [0, 0],     // Top-Left
  RED: [19, 0],       // Top-Right
  GREEN: [19, 19],    // Bottom-Right
  BLUE: [0, 19]       // Bottom-Left
};

export const PLAYER_COLORS: PlayerColor[] = ['BLUE', 'YELLOW', 'RED', 'GREEN'];

export function createEmptyBoard(): (PlayerColor | null)[][] {
  const board: (PlayerColor | null)[][] = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    const row: (PlayerColor | null)[] = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      row.push(null);
    }
    board.push(row);
  }
  return board;
}

export function rotateMatrix(matrix: number[][], rotation: number): number[][] {
  const normalizedRot = ((rotation % 360) + 360) % 360;
  let result = matrix.map(row => [...row]);
  const steps = Math.floor(normalizedRot / 90) % 4;

  for (let s = 0; s < steps; s++) {
    const rows = result.length;
    const cols = result[0].length;
    const rotated: number[][] = [];
    for (let c = 0; c < cols; c++) {
      rotated.push(new Array(rows).fill(0));
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        rotated[c][rows - 1 - r] = result[r][c];
      }
    }
    result = rotated;
  }
  return result;
}

export function flipMatrix(matrix: number[][], flip: boolean): number[][] {
  if (!flip) return matrix.map(row => [...row]);
  // Horizontal flip: mirror each row
  return matrix.map(row => [...row].reverse());
}

export function transformShape(matrix: number[][], rotation: number, flip: boolean): number[][] {
  const flipped = flipMatrix(matrix, flip);
  return rotateMatrix(flipped, rotation);
}

export function getShapeCells(matrix: number[][]): [number, number][] {
  const cells: [number, number][] = [];
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c] === 1) {
        cells.push([c, r]); // [deltaX, deltaY]
      }
    }
  }
  return cells;
}

// Cache transformed relative [dx, dy] cells per shape matrix across the 8 (flip, rotation) variants.
const shapeCellsCache = new WeakMap<number[][], ([number, number][] | undefined)[]>();

function getRelativeShapeCells(baseShape: number[][], rotation: number, flip: boolean): [number, number][] {
  const normalizedRot = ((rotation % 360) + 360) % 360;
  const step = Math.floor(normalizedRot / 90) % 4;
  const cacheIdx = (flip ? 4 : 0) + step;

  let variants = shapeCellsCache.get(baseShape);
  if (!variants) {
    variants = new Array<[number, number][] | undefined>(8);
    shapeCellsCache.set(baseShape, variants);
  }

  let cached = variants[cacheIdx];
  if (!cached) {
    const transformed = transformShape(baseShape, step * 90, flip);
    cached = getShapeCells(transformed);
    variants[cacheIdx] = cached;
  }
  return cached;
}

export function getPieceAbsoluteCoords(
  baseShape: number[][],
  rotation: number,
  flip: boolean,
  originX: number,
  originY: number
): [number, number][] {
  const relativeCells = getRelativeShapeCells(baseShape, rotation, flip);
  const coords: [number, number][] = new Array(relativeCells.length);
  for (let i = 0; i < relativeCells.length; i++) {
    const [dx, dy] = relativeCells[i];
    coords[i] = [originX + dx, originY + dy];
  }
  return coords;
}

/**
 * Sanitizes user-supplied display text (player names, bot names, avatar seeds, chat messages)
 * by stripping HTML tags, trimming whitespace, enforcing max length, and falling back if empty.
 */
export function sanitizeDisplayText(raw: unknown, maxLen: number, fallback: string): string {
  const str = typeof raw === 'string' ? raw : '';
  return str.trim().replace(/<[^>]*>/g, '').substring(0, Math.max(0, maxLen)).trim() || fallback;
}
