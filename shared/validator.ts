import { BOARD_SIZE, STARTING_CORNERS, getPieceAbsoluteCoords, transformShape, getShapeCells } from './board.ts';
import { PIECES } from './pieces.ts';
import { PieceId, PlayerColor } from './types.ts';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function isValidPlacement(
  board: (PlayerColor | null)[][],
  coords: [number, number][],
  color: PlayerColor,
  isFirstMove: boolean
): ValidationResult {
  if (coords.length === 0) {
    return { valid: false, reason: 'Empty piece coordinates' };
  }

  // 1. In-bounds check
  for (const [x, y] of coords) {
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
      return { valid: false, reason: `Cell (${x}, ${y}) is out of bounds` };
    }
  }

  // 2. Cell vacancy check
  for (const [x, y] of coords) {
    if (board[y][x] !== null) {
      return { valid: false, reason: `Cell (${x}, ${y}) is already occupied` };
    }
  }

  // 3. First-move corner check
  if (isFirstMove) {
    const [startX, startY] = STARTING_CORNERS[color];
    const touchesStart = coords.some(([x, y]) => x === startX && y === startY);
    if (!touchesStart) {
      return {
        valid: false,
        reason: `First move must cover your starting corner (${startX}, ${startY})`
      };
    }
    return { valid: true };
  }

  // 4. Edge-collision check (Must NOT touch same color on edges)
  const orthogonalOffsets = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0]
  ];

  for (const [x, y] of coords) {
    for (const [dx, dy] of orthogonalOffsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (board[ny][nx] === color) {
          return {
            valid: false,
            reason: `Pieces cannot touch existing ${color} pieces along edges`
          };
        }
      }
    }
  }

  // 5. Corner-connectivity check (MUST touch >= 1 corner of same color)
  const diagonalOffsets = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];

  let touchesFriendlyCorner = false;
  for (const [x, y] of coords) {
    for (const [dx, dy] of diagonalOffsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (board[ny][nx] === color) {
          touchesFriendlyCorner = true;
          break;
        }
      }
    }
    if (touchesFriendlyCorner) break;
  }

  if (!touchesFriendlyCorner) {
    return {
      valid: false,
      reason: `Move must connect corner-to-corner with at least one existing ${color} piece`
    };
  }

  return { valid: true };
}

export interface CandidateMove {
  pieceId: PieceId;
  rotation: number;
  flip: boolean;
  originX: number;
  originY: number;
  coords: [number, number][];
}

interface PrecomputedOrientation {
  rotation: number;
  flip: boolean;
  cells: [number, number][];
  minDx: number;
  minDy: number;
  maxDx: number;
  maxDy: number;
}

const UNIQUE_ORIENTATIONS: Map<PieceId, PrecomputedOrientation[]> = (() => {
  const map = new Map<PieceId, PrecomputedOrientation[]>();
  const rotations = [0, 90, 180, 270];
  const flips = [false, true];

  for (const pieceId of Object.keys(PIECES) as PieceId[]) {
    const piece = PIECES[pieceId];
    const seenSignatures = new Set<string>();
    const list: PrecomputedOrientation[] = [];

    for (const flip of flips) {
      for (const rot of rotations) {
        const transformed = transformShape(piece.shape, rot, flip);
        const cells = getShapeCells(transformed);
        // Canonical signature handles identical orientations produced by symmetry
        const signature = cells.map(([dx, dy]) => `${dx},${dy}`).join(';');
        if (seenSignatures.has(signature)) continue;
        seenSignatures.add(signature);

        let minDx = BOARD_SIZE, minDy = BOARD_SIZE, maxDx = 0, maxDy = 0;
        for (const [dx, dy] of cells) {
          if (dx < minDx) minDx = dx;
          if (dy < minDy) minDy = dy;
          if (dx > maxDx) maxDx = dx;
          if (dy > maxDy) maxDy = dy;
        }
        list.push({ rotation: rot, flip, cells, minDx, minDy, maxDx, maxDy });
      }
    }
    map.set(pieceId, list);
  }
  return map;
})();

// Module-level scratch buffers reused across synchronous findLegalMoveInternal() calls.
const SCRATCH_FORBIDDEN = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
const SCRATCH_SEEN = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
const SCRATCH_TESTED = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
const DIAGONAL_OFFSETS: readonly [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

function findLegalMoveInternal(
  board: (PlayerColor | null)[][],
  remainingPieces: PieceId[],
  color: PlayerColor,
  isFirstMove: boolean,
  preferLargest: boolean
): CandidateMove | null {
  if (remainingPieces.length === 0) return null;

  // Build flat 20x20 forbidden-cell lookup: occupied OR orthogonally adjacent to same color
  const forbidden = SCRATCH_FORBIDDEN;
  forbidden.fill(0);
  for (let y = 0; y < BOARD_SIZE; y++) {
    const row = board[y];
    const rowOffset = y * BOARD_SIZE;
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cell = row[x];
      if (cell !== null) {
        forbidden[rowOffset + x] = 1;
        if (!isFirstMove && cell === color) {
          if (x > 0) forbidden[rowOffset + x - 1] = 1;
          if (x + 1 < BOARD_SIZE) forbidden[rowOffset + x + 1] = 1;
          if (y > 0) forbidden[rowOffset - BOARD_SIZE + x] = 1;
          if (y + 1 < BOARD_SIZE) forbidden[rowOffset + BOARD_SIZE + x] = 1;
        }
      }
    }
  }

  let candidateTargets: [number, number][] | null = null;
  if (isFirstMove) {
    const [cornerX, cornerY] = STARTING_CORNERS[color];
    if (forbidden[cornerY * BOARD_SIZE + cornerX]) return null;
    candidateTargets = [[cornerX, cornerY]];
  } else {
    candidateTargets = [];
    const seen = SCRATCH_SEEN;
    seen.fill(0);
    for (let y = 0; y < BOARD_SIZE; y++) {
      const row = board[y];
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (row[x] === color) {
          for (const [dx, dy] of DIAGONAL_OFFSETS) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
              const key = ny * BOARD_SIZE + nx;
              if (!seen[key] && !forbidden[key]) {
                seen[key] = 1;
                candidateTargets.push([nx, ny]);
              }
            }
          }
        }
      }
    }
    if (candidateTargets.length === 0) return null;
  }

  const orderedPieces = preferLargest
    ? [...remainingPieces].sort((a, b) => (PIECES[b]?.size || 0) - (PIECES[a]?.size || 0))
    : remainingPieces;

  const tested = SCRATCH_TESTED;

  for (const pieceId of orderedPieces) {
    const orientations = UNIQUE_ORIENTATIONS.get(pieceId);
    if (!orientations) continue;

    for (const orient of orientations) {
      const { rotation, flip, cells, minDx, minDy, maxDx, maxDy } = orient;
      const minOx = -minDx;
      const minOy = -minDy;
      const limitX = BOARD_SIZE - maxDx;
      const limitY = BOARD_SIZE - maxDy;

      tested.fill(0);

      for (const [tx, ty] of candidateTargets) {
        for (const [dx, dy] of cells) {
          const ox = tx - dx;
          const oy = ty - dy;
          if (ox < minOx || ox >= limitX || oy < minOy || oy >= limitY) continue;

          const originKey = oy * BOARD_SIZE + ox;
          if (tested[originKey]) continue;
          tested[originKey] = 1;

          let blocked = false;
          for (let i = 0; i < cells.length; i++) {
            const [cx, cy] = cells[i];
            if (forbidden[(oy + cy) * BOARD_SIZE + (ox + cx)]) {
              blocked = true;
              break;
            }
          }

          if (!blocked) {
            const coords: [number, number][] = cells.map(([cx, cy]) => [ox + cx, oy + cy]);
            return { pieceId, rotation, flip, originX: ox, originY: oy, coords };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Checks if the player has at least one valid move remaining on the board.
 * Uses deduplicated piece orientations (91 unique) and a flat 400-cell
 * occupancy/orthogonal bitmask to eliminate inner-loop allocations.
 */
export function findFirstLegalMove(
  board: (PlayerColor | null)[][],
  remainingPieces: PieceId[],
  color: PlayerColor,
  isFirstMove: boolean
): CandidateMove | null {
  return findLegalMoveInternal(board, remainingPieces, color, isFirstMove, false);
}

/**
 * Finds a legal move prioritizing larger pieces first (pentominoes -> monomino),
 * saving smaller flexible pieces for late-game tight spots.
 */
export function findBotLegalMove(
  board: (PlayerColor | null)[][],
  remainingPieces: PieceId[],
  color: PlayerColor,
  isFirstMove: boolean
): CandidateMove | null {
  return findLegalMoveInternal(board, remainingPieces, color, isFirstMove, true);
}
