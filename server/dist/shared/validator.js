"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidPlacement = isValidPlacement;
exports.findFirstLegalMove = findFirstLegalMove;
const board_ts_1 = require("./board.ts");
const pieces_ts_1 = require("./pieces.ts");
function isValidPlacement(board, coords, color, isFirstMove) {
    if (coords.length === 0) {
        return { valid: false, reason: 'Empty piece coordinates' };
    }
    // 1. In-bounds check
    for (const [x, y] of coords) {
        if (x < 0 || x >= board_ts_1.BOARD_SIZE || y < 0 || y >= board_ts_1.BOARD_SIZE) {
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
        const [startX, startY] = board_ts_1.STARTING_CORNERS[color];
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
            if (nx >= 0 && nx < board_ts_1.BOARD_SIZE && ny >= 0 && ny < board_ts_1.BOARD_SIZE) {
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
            if (nx >= 0 && nx < board_ts_1.BOARD_SIZE && ny >= 0 && ny < board_ts_1.BOARD_SIZE) {
                if (board[ny][nx] === color) {
                    touchesFriendlyCorner = true;
                    break;
                }
            }
        }
        if (touchesFriendlyCorner)
            break;
    }
    if (!touchesFriendlyCorner) {
        return {
            valid: false,
            reason: `Move must connect corner-to-corner with at least one existing ${color} piece`
        };
    }
    return { valid: true };
}
/**
 * Checks if the player has at least one valid move remaining on the board.
 * Heavily optimized: narrows the search space by pre-computing which board
 * positions could possibly satisfy placement rules, instead of brute-forcing
 * all 400 cells per orientation.
 */
function findFirstLegalMove(board, remainingPieces, color, isFirstMove) {
    const rotations = [0, 90, 180, 270];
    const flips = [false, true];
    // For non-first moves, pre-compute candidate target cells:
    // empty cells diagonally adjacent to an existing same-color piece.
    // A valid placement MUST cover at least one of these cells.
    let candidateTargets = null;
    if (!isFirstMove) {
        candidateTargets = [];
        const seen = new Set();
        const diags = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (let y = 0; y < board_ts_1.BOARD_SIZE; y++) {
            for (let x = 0; x < board_ts_1.BOARD_SIZE; x++) {
                if (board[y][x] === color) {
                    for (const [dx, dy] of diags) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < board_ts_1.BOARD_SIZE && ny >= 0 && ny < board_ts_1.BOARD_SIZE && board[ny][nx] === null) {
                            const key = ny * board_ts_1.BOARD_SIZE + nx;
                            if (!seen.has(key)) {
                                seen.add(key);
                                candidateTargets.push([nx, ny]);
                            }
                        }
                    }
                }
            }
        }
        if (candidateTargets.length === 0)
            return null;
    }
    const startCorner = isFirstMove ? board_ts_1.STARTING_CORNERS[color] : null;
    for (const pieceId of remainingPieces) {
        const piece = pieces_ts_1.PIECES[pieceId];
        if (!piece)
            continue;
        for (const flip of flips) {
            for (const rot of rotations) {
                const transformed = (0, board_ts_1.transformShape)(piece.shape, rot, flip);
                const shapeCells = (0, board_ts_1.getShapeCells)(transformed);
                // Pre-compute bounding box to skip out-of-bounds origins
                let maxDx = 0, maxDy = 0;
                for (const [dx, dy] of shapeCells) {
                    if (dx > maxDx)
                        maxDx = dx;
                    if (dy > maxDy)
                        maxDy = dy;
                }
                const limitX = board_ts_1.BOARD_SIZE - maxDx;
                const limitY = board_ts_1.BOARD_SIZE - maxDy;
                if (startCorner) {
                    // First move: only test origins where a piece cell lands on the starting corner
                    const [cornerX, cornerY] = startCorner;
                    for (const [dx, dy] of shapeCells) {
                        const ox = cornerX - dx;
                        const oy = cornerY - dy;
                        if (ox < 0 || ox >= limitX || oy < 0 || oy >= limitY)
                            continue;
                        const coords = shapeCells.map(([ddx, ddy]) => [ox + ddx, oy + ddy]);
                        const res = isValidPlacement(board, coords, color, true);
                        if (res.valid) {
                            return { pieceId, rotation: rot, flip, originX: ox, originY: oy, coords };
                        }
                    }
                }
                else if (candidateTargets) {
                    // Non-first move: only test origins where a piece cell lands on a candidate target
                    const tested = new Set();
                    for (const [tx, ty] of candidateTargets) {
                        for (const [dx, dy] of shapeCells) {
                            const ox = tx - dx;
                            const oy = ty - dy;
                            if (ox < 0 || ox >= limitX || oy < 0 || oy >= limitY)
                                continue;
                            const key = oy * board_ts_1.BOARD_SIZE + ox;
                            if (tested.has(key))
                                continue;
                            tested.add(key);
                            const coords = shapeCells.map(([ddx, ddy]) => [ox + ddx, oy + ddy]);
                            const res = isValidPlacement(board, coords, color, false);
                            if (res.valid) {
                                return { pieceId, rotation: rot, flip, originX: ox, originY: oy, coords };
                            }
                        }
                    }
                }
            }
        }
    }
    return null;
}
