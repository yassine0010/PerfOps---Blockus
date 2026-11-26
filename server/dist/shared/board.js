"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAYER_COLORS = exports.STARTING_CORNERS = exports.BOARD_SIZE = void 0;
exports.createEmptyBoard = createEmptyBoard;
exports.rotateMatrix = rotateMatrix;
exports.flipMatrix = flipMatrix;
exports.transformShape = transformShape;
exports.getShapeCells = getShapeCells;
exports.getPieceAbsoluteCoords = getPieceAbsoluteCoords;
exports.BOARD_SIZE = 20;
exports.STARTING_CORNERS = {
    YELLOW: [0, 0], // Top-Left
    RED: [19, 0], // Top-Right
    GREEN: [19, 19], // Bottom-Right
    BLUE: [0, 19] // Bottom-Left
};
exports.PLAYER_COLORS = ['BLUE', 'YELLOW', 'RED', 'GREEN'];
function createEmptyBoard() {
    const board = [];
    for (let y = 0; y < exports.BOARD_SIZE; y++) {
        const row = [];
        for (let x = 0; x < exports.BOARD_SIZE; x++) {
            row.push(null);
        }
        board.push(row);
    }
    return board;
}
function rotateMatrix(matrix, rotation) {
    const normalizedRot = ((rotation % 360) + 360) % 360;
    let result = matrix.map(row => [...row]);
    const steps = Math.floor(normalizedRot / 90) % 4;
    for (let s = 0; s < steps; s++) {
        const rows = result.length;
        const cols = result[0].length;
        const rotated = [];
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
function flipMatrix(matrix, flip) {
    if (!flip)
        return matrix.map(row => [...row]);
    // Horizontal flip: mirror each row
    return matrix.map(row => [...row].reverse());
}
function transformShape(matrix, rotation, flip) {
    const flipped = flipMatrix(matrix, flip);
    return rotateMatrix(flipped, rotation);
}
function getShapeCells(matrix) {
    const cells = [];
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c] === 1) {
                cells.push([c, r]); // [deltaX, deltaY]
            }
        }
    }
    return cells;
}
function getPieceAbsoluteCoords(baseShape, rotation, flip, originX, originY) {
    const transformed = transformShape(baseShape, rotation, flip);
    const relativeCells = getShapeCells(transformed);
    return relativeCells.map(([dx, dy]) => [originX + dx, originY + dy]);
}
