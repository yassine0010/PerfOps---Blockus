import { PieceDefinition, PieceId } from './types.ts';

export const PIECES: Record<PieceId, PieceDefinition> = {
  O1: {
    id: 'O1',
    name: '1-Square (Monomino)',
    size: 1,
    shape: [
      [1]
    ]
  },
  I2: {
    id: 'I2',
    name: '2-Bar (Domino)',
    size: 2,
    shape: [
      [1, 1]
    ]
  },
  I3: {
    id: 'I3',
    name: '3-Bar',
    size: 3,
    shape: [
      [1, 1, 1]
    ]
  },
  V3: {
    id: 'V3',
    name: '3-Corner',
    size: 3,
    shape: [
      [1, 0],
      [1, 1]
    ]
  },
  I4: {
    id: 'I4',
    name: '4-Bar',
    size: 4,
    shape: [
      [1, 1, 1, 1]
    ]
  },
  L4: {
    id: 'L4',
    name: '4-L',
    size: 4,
    shape: [
      [1, 0],
      [1, 0],
      [1, 1]
    ]
  },
  T4: {
    id: 'T4',
    name: '4-T',
    size: 4,
    shape: [
      [1, 1, 1],
      [0, 1, 0]
    ]
  },
  O4: {
    id: 'O4',
    name: '4-Square',
    size: 4,
    shape: [
      [1, 1],
      [1, 1]
    ]
  },
  Z4: {
    id: 'Z4',
    name: '4-Z',
    size: 4,
    shape: [
      [1, 1, 0],
      [0, 1, 1]
    ]
  },
  F5: {
    id: 'F5',
    name: '5-F',
    size: 5,
    shape: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 1, 0]
    ]
  },
  I5: {
    id: 'I5',
    name: '5-Bar',
    size: 5,
    shape: [
      [1, 1, 1, 1, 1]
    ]
  },
  L5: {
    id: 'L5',
    name: '5-L',
    size: 5,
    shape: [
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 1]
    ]
  },
  P5: {
    id: 'P5',
    name: '5-P',
    size: 5,
    shape: [
      [1, 1],
      [1, 1],
      [1, 0]
    ]
  },
  N5: {
    id: 'N5',
    name: '5-N',
    size: 5,
    shape: [
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 1]
    ]
  },
  T5: {
    id: 'T5',
    name: '5-T',
    size: 5,
    shape: [
      [1, 1, 1],
      [0, 1, 0],
      [0, 1, 0]
    ]
  },
  U5: {
    id: 'U5',
    name: '5-U',
    size: 5,
    shape: [
      [1, 0, 1],
      [1, 1, 1]
    ]
  },
  V5: {
    id: 'V5',
    name: '5-V',
    size: 5,
    shape: [
      [1, 0, 0],
      [1, 0, 0],
      [1, 1, 1]
    ]
  },
  W5: {
    id: 'W5',
    name: '5-W',
    size: 5,
    shape: [
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 1]
    ]
  },
  X5: {
    id: 'X5',
    name: '5-Cross',
    size: 5,
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0]
    ]
  },
  Y5: {
    id: 'Y5',
    name: '5-Y',
    size: 5,
    shape: [
      [0, 1],
      [1, 1],
      [0, 1],
      [0, 1]
    ]
  },
  Z5: {
    id: 'Z5',
    name: '5-Z',
    size: 5,
    shape: [
      [1, 1, 0],
      [0, 1, 0],
      [0, 1, 1]
    ]
  }
};

export const ALL_PIECE_IDS: PieceId[] = Object.keys(PIECES) as PieceId[];
