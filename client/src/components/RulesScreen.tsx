import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ArrowRight, Check, X, Trophy, Sparkles, AlertTriangle, Users, Swords, UserPlus } from 'lucide-react';
import { PieceRenderer } from './PieceRenderer';
import { PIECES } from '../../../shared/pieces';

interface RulesScreenProps {
  onBack: () => void;
  initialSlide?: number;
  initialMode?: '2P' | '3P' | '4P' | 'CORE';
}

export const RulesScreen: React.FC<RulesScreenProps> = ({
  onBack,
  initialSlide,
  initialMode
}) => {
  const getInitialSlideIndex = () => {
    if (initialSlide !== undefined) return initialSlide;
    if (initialMode === '2P') return 6;
    if (initialMode === '3P') return 7;
    if (initialMode === '4P') return 5;
    return 0;
  };

  const [currentSlide, setCurrentSlide] = useState(getInitialSlideIndex);
  const [slideDirection, setSlideDirection] = useState<'forward' | 'backward'>('forward');

  // Sync if initialSlide or initialMode changes
  useEffect(() => {
    if (initialSlide !== undefined) {
      setCurrentSlide(initialSlide);
    } else if (initialMode) {
      if (initialMode === '2P') setCurrentSlide(6);
      else if (initialMode === '3P') setCurrentSlide(7);
      else if (initialMode === '4P') setCurrentSlide(5);
      else if (initialMode === 'CORE') setCurrentSlide(0);
    }
  }, [initialSlide, initialMode]);

  // Touch swipe support
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide]);

  const handleNext = () => {
    if (currentSlide < 7) {
      setSlideDirection('forward');
      setCurrentSlide(s => s + 1);
    } else {
      onBack();
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setSlideDirection('backward');
      setCurrentSlide(s => s - 1);
    } else {
      onBack();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current !== null && touchEndXRef.current !== null) {
      const deltaX = touchStartXRef.current - touchEndXRef.current;
      if (deltaX > 45) {
        handleNext();
      } else if (deltaX < -45) {
        handlePrev();
      }
    }
    touchStartXRef.current = null;
    touchEndXRef.current = null;
  };

  const isLastSlide = currentSlide === 7;

  // ---------------------------------------------------------------------------
  // SLIDE 1: MEET YOUR 21 PIECES (EXTRA LARGE & SPACIOUS)
  // ---------------------------------------------------------------------------
  const renderSlide1 = () => (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 28,
        padding: 'min(24px, 5vw) min(20px, 4vw)',
        border: '1.5px solid #E2E8F0',
        boxShadow: '0 12px 36px rgba(0,0,0,0.06)',
        width: '100%',
        maxWidth: 720,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      {/* Set Header Pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#EFF6FF',
          padding: '12px 16px',
          borderRadius: 20,
          border: '1.5px solid #BFDBFE',
          flexWrap: 'wrap',
          gap: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#3E82F7',
              boxShadow: '0 2px 8px rgba(62, 130, 247, 0.5)',
              flexShrink: 0
            }}
          />
          <span style={{ fontSize: 'clamp(0.85rem, 3.2vw, 1.05rem)', fontWeight: 900, color: '#1E40AF', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>
            YOUR COLOR · 21 PIECES
          </span>
        </div>
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 900,
            background: '#DBEAFE',
            color: '#1D4ED8',
            padding: '5px 12px',
            borderRadius: 99,
            letterSpacing: '0.3px',
            whiteSpace: 'nowrap'
          }}
        >
          89 SQUARES
        </span>
      </div>

      {/* 4 Large Columns matching rules reference */}
      <div className="rules-pieces-grid">
        {/* Col 1: 1-sq & 2-sq */}
        <div className="rules-pieces-col rules-pieces-col-1">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, paddingTop: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <PieceRenderer shape={PIECES.O1.shape} color="BLUE" size={26} />
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155', textAlign: 'center', lineHeight: 1.2 }}>
                1 pc<br /><span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>ONE-SQ</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <PieceRenderer shape={PIECES.I2.shape} color="BLUE" size={26} />
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155', textAlign: 'center', lineHeight: 1.2 }}>
                1 pc<br /><span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>TWO-SQ</span>
              </div>
            </div>
          </div>
        </div>

        {/* Col 2: 2 three-square pieces */}
        <div className="rules-pieces-col rules-pieces-col-2">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, paddingTop: 8 }}>
            <PieceRenderer shape={PIECES.I3.shape} color="BLUE" size={22} />
            <PieceRenderer shape={PIECES.V3.shape} color="BLUE" size={22} />
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155', textAlign: 'center', lineHeight: 1.2, marginTop: 12 }}>
            2 pcs<br /><span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>THREE-SQ</span>
          </div>
        </div>

        {/* Col 3: 5 four-square pieces */}
        <div className="rules-pieces-col rules-pieces-col-3">
          <div className="rules-pieces-col-3-list" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 6 }}>
            <PieceRenderer shape={PIECES.I4.shape} color="BLUE" size={15} />
            <PieceRenderer shape={PIECES.L4.shape} color="BLUE" size={15} />
            <PieceRenderer shape={PIECES.T4.shape} color="BLUE" size={15} />
            <PieceRenderer shape={PIECES.O4.shape} color="BLUE" size={15} />
            <PieceRenderer shape={PIECES.Z4.shape} color="BLUE" size={15} />
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155', textAlign: 'center', lineHeight: 1.2, marginTop: 8 }}>
            5 pcs<br /><span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>FOUR-SQ</span>
          </div>
        </div>

        {/* Col 4: 12 five-square pieces (ALL 12 PENTOMINOES) */}
        <div className="rules-pieces-col rules-pieces-col-4">
          <div className="rules-pentominoes-grid">
            <PieceRenderer shape={PIECES.I5.shape} color="BLUE" size={13} />
            <PieceRenderer shape={PIECES.L5.shape} color="BLUE" size={13} />
            <PieceRenderer shape={PIECES.Y5.shape} color="BLUE" size={13} />
            <PieceRenderer shape={PIECES.P5.shape} color="BLUE" size={13} />
            <PieceRenderer shape={PIECES.N5.shape} color="BLUE" size={13} />
            <PieceRenderer shape={PIECES.T5.shape} color="BLUE" size={13} />
            <PieceRenderer shape={PIECES.U5.shape} color="BLUE" size={13} />
            <PieceRenderer shape={PIECES.V5.shape} color="BLUE" size={13} />
            <PieceRenderer shape={PIECES.W5.shape} color="BLUE" size={13} />
            <PieceRenderer shape={PIECES.X5.shape} color="BLUE" size={13} />
            <PieceRenderer shape={PIECES.Z5.shape} color="BLUE" size={13} />
            <PieceRenderer shape={PIECES.F5.shape} color="BLUE" size={13} />
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155', textAlign: 'center', lineHeight: 1.2, marginTop: 10 }}>
            12 pcs<br /><span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>FIVE-SQ (PENTOMINOES)</span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontSize: '0.82rem',
          color: '#64748B',
          fontWeight: 700,
          textAlign: 'center'
        }}
      >
        <Sparkles size={16} color="var(--primary-coral)" style={{ flexShrink: 0 }} />
        Every player starts with the exact same identical set of 21 pieces.
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // SLIDE 2: START FROM YOUR CORNER (EXTRA LARGE 20x20 BOARD)
  // ---------------------------------------------------------------------------
  const renderSlide2 = () => {
    const boardCells = Array.from({ length: 20 }, (_, r) =>
      Array.from({ length: 20 }, (_, c) => {
        // Yellow piece on top-left (0,0) - 5-L piece
        if ((r === 0 && c === 0) || (r === 1 && c === 0) || (r === 2 && c === 0) || (r === 3 && c === 0) || (r === 3 && c === 1)) {
          return '#F5A623';
        }
        // Red piece on top-right (0,19) - 4-T piece
        if ((r === 0 && c === 18) || (r === 0 && c === 19) || (r === 0 && c === 17) || (r === 1 && c === 18)) {
          return '#E64A4A';
        }
        // Blue piece on bottom-left (19,0) - 5-P piece
        if ((r === 19 && c === 0) || (r === 18 && c === 0) || (r === 19 && c === 1) || (r === 18 && c === 1) || (r === 17 && c === 0)) {
          return '#3E82F7';
        }
        // Green piece on bottom-right (19,19) - 4-Square piece
        if ((r === 19 && c === 19) || (r === 18 && c === 19) || (r === 19 && c === 18) || (r === 18 && c === 18)) {
          return '#38A169';
        }
        return null;
      })
    );

    return (
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 28,
          padding: '26px 20px',
          border: '1.5px solid #E2E8F0',
          boxShadow: '0 12px 36px rgba(0,0,0,0.06)',
          width: '100%',
          maxWidth: 720,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 'min(380px, 86vw)',
            height: 'min(380px, 86vw)',
            background: '#FFFFFF',
            borderRadius: 22,
            border: '2.5px solid #CBD5E1',
            display: 'grid',
            gridTemplateColumns: 'repeat(20, 1fr)',
            gridTemplateRows: 'repeat(20, 1fr)',
            padding: 5,
            boxShadow: '0 10px 30px rgba(0,0,0,0.08)'
          }}
        >
          {/* Starting corner marker dots with glowing rings */}
          <div style={{ position: 'absolute', top: 8, left: 8, width: 12, height: 12, borderRadius: '50%', background: '#F5A623', zIndex: 10, boxShadow: '0 0 10px #F5A623', border: '2px solid #FFFFFF' }} />
          <div style={{ position: 'absolute', top: 8, right: 8, width: 12, height: 12, borderRadius: '50%', background: '#E64A4A', zIndex: 10, boxShadow: '0 0 10px #E64A4A', border: '2px solid #FFFFFF' }} />
          <div style={{ position: 'absolute', bottom: 8, left: 8, width: 12, height: 12, borderRadius: '50%', background: '#3E82F7', zIndex: 10, boxShadow: '0 0 10px #3E82F7', border: '2px solid #FFFFFF' }} />
          <div style={{ position: 'absolute', bottom: 8, right: 8, width: 12, height: 12, borderRadius: '50%', background: '#38A169', zIndex: 10, boxShadow: '0 0 10px #38A169', border: '2px solid #FFFFFF' }} />

          {boardCells.map((row, r) =>
            row.map((color, c) => (
              <div
                key={`${r}-${c}`}
                style={{
                  width: '100%',
                  height: '100%',
                  border: '0.5px solid #E2E8F0',
                  background: color || '#F8FAFC',
                  borderRadius: color ? 2.5 : 0,
                  boxShadow: color ? 'inset 0 1px 0 rgba(255,255,255,0.5)' : 'none'
                }}
              />
            ))
          )}
        </div>

        {/* Informative Rule Badge */}
        <div
          style={{
            background: '#EFF6FF',
            color: '#1E40AF',
            border: '1.5px solid #BFDBFE',
            borderRadius: 99,
            padding: '10px 22px',
            fontSize: '0.92rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 2px 8px rgba(30, 64, 175, 0.08)'
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3E82F7', boxShadow: '0 0 6px #3E82F7' }} />
          Your very first piece must cover your assigned corner square.
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // SLIDE 3: CORNERS KISS. EDGES DON'T. (EXTRA LARGE COMPARISON)
  // ---------------------------------------------------------------------------
  const renderSlide3 = () => (
    <div
      className="rules-comparison-grid"
      style={{
        background: '#FFFFFF',
        borderRadius: 28,
        padding: 'min(24px, 5vw) min(20px, 4vw)',
        border: '1.5px solid #E2E8F0',
        boxShadow: '0 12px 36px rgba(0,0,0,0.06)',
        maxWidth: 720
      }}
    >
      {/* LEGAL CARD */}
      <div
        style={{
          background: '#F0FDF4',
          borderRadius: 24,
          border: '2px solid #22C55E',
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '1rem',
            fontWeight: 900,
            color: '#15803D'
          }}
        >
          <span>LEGAL MOVE</span>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#22C55E',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(34, 197, 94, 0.4)'
            }}
          >
            <Check size={16} strokeWidth={3.8} />
          </div>
        </div>

        {/* 6x6 Grid with 2 DISTINCT pieces touching at diagonal corner only */}
        <div
          style={{
            position: 'relative',
            width: 'min(200px, 38vw)',
            height: 'min(200px, 38vw)',
            background: '#FFFFFF',
            borderRadius: 18,
            border: '2px solid #DCFCE7',
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gridTemplateRows: 'repeat(6, 1fr)',
            padding: 5
          }}
        >
          {Array.from({ length: 6 }).map((_, r) =>
            Array.from({ length: 6 }).map((_, c) => {
              // Piece 1: Blue L-piece at (1,1), (2,1), (3,1), (3,2)
              const isPiece1 = (r === 1 && c === 1) || (r === 2 && c === 1) || (r === 3 && c === 1) || (r === 3 && c === 2);
              // Piece 2: Blue 3-bar at (4,3), (4,4), (4,5) touching ONLY corner (3,2) to (4,3)
              const isPiece2 = (r === 4 && c === 3) || (r === 4 && c === 4) || (r === 4 && c === 5);

              return (
                <div
                  key={`legal-${r}-${c}`}
                  style={{
                    border: '0.5px solid #F1F5F9',
                    background: isPiece1 ? '#3E82F7' : isPiece2 ? '#2563EB' : '#FAFAFA',
                    borderRadius: isPiece1 || isPiece2 ? 4 : 0,
                    boxShadow: isPiece1 || isPiece2 ? 'inset 0 1.5px 0 #93C5FD' : 'none'
                  }}
                />
              );
            })
          )}

          {/* Green pulse ring at corner contact point (3,2) to (4,3) */}
          <div
            style={{
              position: 'absolute',
              top: '66.6%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: '#22C55E',
              border: '3px solid #FFFFFF',
              boxShadow: '0 0 14px #22C55E',
              animation: 'pulseCorner 1.5s infinite ease-out'
            }}
          />
        </div>

        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#15803D', textAlign: 'center' }}>
          ✓ Corner-to-corner contact
        </span>
      </div>

      {/* NOPE / ILLEGAL CARD */}
      <div
        style={{
          background: '#FEF2F2',
          borderRadius: 24,
          border: '2px solid #EF4444',
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '1rem',
            fontWeight: 900,
            color: '#B91C1C'
          }}
        >
          <span>ILLEGAL MOVE</span>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#EF4444',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)'
            }}
          >
            <X size={16} strokeWidth={3.8} />
          </div>
        </div>

        {/* 6x6 Grid with 2 DISTINCT pieces touching along flat edge */}
        <div
          style={{
            position: 'relative',
            width: 'min(200px, 38vw)',
            height: 'min(200px, 38vw)',
            background: '#FFFFFF',
            borderRadius: 18,
            border: '2px solid #FEE2E2',
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gridTemplateRows: 'repeat(6, 1fr)',
            padding: 5
          }}
        >
          {Array.from({ length: 6 }).map((_, r) =>
            Array.from({ length: 6 }).map((_, c) => {
              // Piece 1: Vertical 4-bar at (1,1), (2,1), (3,1), (4,1)
              const isPiece1 = (r === 1 && c === 1) || (r === 2 && c === 1) || (r === 3 && c === 1) || (r === 4 && c === 1);
              // Piece 2: 3-bar at (2,2), (3,2), (4,2) touching along the edge!
              const isPiece2 = (r === 2 && c === 2) || (r === 3 && c === 2) || (r === 4 && c === 2);

              return (
                <div
                  key={`nope-${r}-${c}`}
                  style={{
                    border: '0.5px solid #F1F5F9',
                    background: isPiece1 ? '#3E82F7' : isPiece2 ? '#2563EB' : '#FAFAFA',
                    borderRadius: isPiece1 || isPiece2 ? 4 : 0,
                    boxShadow: isPiece1 || isPiece2 ? 'inset 0 1.5px 0 #93C5FD' : 'none'
                  }}
                />
              );
            })
          )}

          {/* Red warning boundary line highlighting shared illegal edge */}
          <div
            style={{
              position: 'absolute',
              top: '33.3%',
              left: '33.3%',
              height: '50%',
              width: 5,
              background: '#EF4444',
              borderRadius: 3,
              boxShadow: '0 0 12px #EF4444',
              zIndex: 10
            }}
          />

          {/* Red X badge on the illegal touching edge */}
          <div
            style={{
              position: 'absolute',
              top: '58%',
              left: '33.3%',
              transform: 'translate(-50%, -50%)',
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#EF4444',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20,
              boxShadow: '0 0 10px rgba(239, 68, 68, 0.9)'
            }}
          >
            <X size={14} strokeWidth={4} />
          </div>
        </div>

        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#B91C1C', textAlign: 'center' }}>
          ✖ Flat edges cannot touch!
        </span>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // SLIDE 4: DIFFERENT COLORS CAN GET COZY (LARGE BOARD, NO TURN PILL)
  // ---------------------------------------------------------------------------
  const renderSlide4 = () => (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 28,
        padding: '28px 24px',
        border: '1.5px solid #E2E8F0',
        boxShadow: '0 12px 36px rgba(0,0,0,0.06)',
        width: '100%',
        maxWidth: 720,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20
      }}
    >
      {/* Large Multi-colored clustered pieces with real grid */}
      <div
        style={{
          width: 'min(440px, 88vw)',
          height: 260,
          background: '#FFFFFF',
          borderRadius: 20,
          border: '2px solid #CBD5E1',
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gridTemplateRows: 'repeat(8, 1fr)',
          padding: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.06)'
        }}
      >
        {Array.from({ length: 8 }).map((_, r) =>
          Array.from({ length: 12 }).map((_, c) => {
            let color: string | null = null;
            // Blue piece
            if ((r === 2 && c === 3) || (r === 3 && c === 3) || (r === 3 && c === 4)) {
              color = '#3E82F7';
            }
            // Yellow piece touching blue directly on edge
            if ((r === 3 && c === 5) || (r === 4 && c === 5) || (r === 4 && c === 6)) {
              color = '#F5A623';
            }
            // Red piece touching yellow
            if ((r === 2 && c === 6) || (r === 2 && c === 7) || (r === 3 && c === 7)) {
              color = '#E64A4A';
            }
            // Green piece touching red & blue
            if ((r === 5 && c === 4) || (r === 5 && c === 5) || (r === 6 && c === 5)) {
              color = '#38A169';
            }

            return (
              <div
                key={`cozy-${r}-${c}`}
                style={{
                  border: '0.5px solid #E2E8F0',
                  background: color || '#F8FAFC',
                  borderRadius: color ? 3 : 0,
                  boxShadow: color ? 'inset 0 1.5px 0 rgba(255,255,255,0.5)' : 'none'
                }}
              />
            );
          })
        )}
      </div>

      {/* Prominent Badge */}
      <div
        style={{
          background: '#DCFCE7',
          color: '#15803D',
          border: '1.5px solid #86EFAC',
          borderRadius: 99,
          padding: '10px 26px',
          fontSize: '0.94rem',
          fontWeight: 900,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          boxShadow: '0 2px 10px rgba(34, 197, 94, 0.2)'
        }}
      >
        <Check size={20} strokeWidth={3.5} />
        OTHER COLORS MAY TOUCH EDGES FREELY
      </div>

      <p
        style={{
          fontSize: '0.88rem',
          color: '#64748B',
          fontWeight: 700,
          textAlign: 'center',
          margin: 0,
          maxWidth: 480
        }}
      >
        The corner-to-corner rule applies only to pieces of your own color. Different colors can touch edges freely!
      </p>
    </div>
  );

  // ---------------------------------------------------------------------------
  // SLIDE 5: BASIC SCORING (FAITHFUL TO RULES 1 & RULES 2)
  // ---------------------------------------------------------------------------
  const renderSlide5 = () => (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 28,
        padding: '28px 24px',
        border: '1.5px solid #E2E8F0',
        boxShadow: '0 12px 36px rgba(0,0,0,0.06)',
        width: '100%',
        maxWidth: 720,
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}
    >
      {/* Scoreboard Header matching rules 1.jpeg */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 8px'
        }}
      >
        <span
          style={{
            fontSize: '0.9rem',
            fontWeight: 900,
            color: '#1E293B',
            letterSpacing: '0.8px'
          }}
        >
          SQUARES LEFT
        </span>
        <span
          style={{
            fontSize: '0.82rem',
            fontWeight: 900,
            color: '#64748B',
            letterSpacing: '0.6px'
          }}
        >
          LOWER WINS
        </span>
      </div>

      {/* 4 Player Rows matching rules 1.jpeg */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* YOU - Winner (Row highlighted in yellow) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 22px',
            borderRadius: 18,
            background: '#FEF9C3',
            border: '2px solid #FDE047',
            boxShadow: '0 4px 14px rgba(234, 179, 8, 0.15)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: 100 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#3E82F7',
                boxShadow: '0 2px 6px rgba(62, 130, 247, 0.4)'
              }}
            />
            <span style={{ fontWeight: 900, fontSize: '1.05rem', color: '#1E293B' }}>
              YOU
            </span>
          </div>

          {/* Visual 3 blue squares */}
          <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center' }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: '#3E82F7',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)'
                }}
              />
            ))}
          </div>

          {/* Score count 3 with crown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 70, justifyContent: 'flex-end' }}>
            <span style={{ fontWeight: 900, fontSize: '1.4rem', color: '#1E293B' }}>
              3
            </span>
            <Trophy size={22} color="#CA8A04" />
          </div>
        </div>

        {/* NIA - 7 squares */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 22px',
            borderRadius: 16,
            background: '#F8FAFC',
            border: '1.5px solid #E2E8F0'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: 100 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#F5A623'
              }}
            />
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#1E293B' }}>
              NIA
            </span>
          </div>

          {/* Visual 7 yellow squares */}
          <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: '#F5A623',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)'
                }}
              />
            ))}
          </div>

          <div style={{ width: 70, textAlign: 'right' }}>
            <span style={{ fontWeight: 900, fontSize: '1.3rem', color: '#1E293B' }}>
              7
            </span>
          </div>
        </div>

        {/* LEO - 9 squares */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 22px',
            borderRadius: 16,
            background: '#F8FAFC',
            border: '1.5px solid #E2E8F0'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: 100 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#E64A4A'
              }}
            />
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#1E293B' }}>
              LEO
            </span>
          </div>

          {/* Visual 9 red squares */}
          <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: '#E64A4A',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)'
                }}
              />
            ))}
          </div>

          <div style={{ width: 70, textAlign: 'right' }}>
            <span style={{ fontWeight: 900, fontSize: '1.3rem', color: '#1E293B' }}>
              9
            </span>
          </div>
        </div>

        {/* MIA - 12 squares */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 22px',
            borderRadius: 16,
            background: '#F8FAFC',
            border: '1.5px solid #E2E8F0'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: 100 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#38A169'
              }}
            />
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#1E293B' }}>
              MIA
            </span>
          </div>

          {/* Visual 12 green squares */}
          <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: '#38A169',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)'
                }}
              />
            ))}
          </div>

          <div style={{ width: 70, textAlign: 'right' }}>
            <span style={{ fontWeight: 900, fontSize: '1.3rem', color: '#1E293B' }}>
              12
            </span>
          </div>
        </div>
      </div>

      {/* Official Blokus Bonuses */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
          marginTop: 4
        }}
      >
        <div
          style={{
            background: '#F0FDF4',
            border: '1.5px solid #BBF7D0',
            borderRadius: 14,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <span style={{ background: '#16A34A', color: '#FFFFFF', fontWeight: 900, fontSize: '0.78rem', padding: '4px 9px', borderRadius: 99 }}>
            +15
          </span>
          <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 700, lineHeight: 1.3 }}>
            <strong>All Pieces Placed:</strong> Empty your tray (0 left) for a -15 net score bonus.
          </div>
        </div>

        <div
          style={{
            background: '#EFF6FF',
            border: '1.5px solid #BFDBFE',
            borderRadius: 14,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <span style={{ background: '#2563EB', color: '#FFFFFF', fontWeight: 900, fontSize: '0.78rem', padding: '4px 9px', borderRadius: 99 }}>
            +20
          </span>
          <div style={{ fontSize: '0.8rem', color: '#1E40AF', fontWeight: 700, lineHeight: 1.3 }}>
            <strong>Monomino Last:</strong> Place your 1-square last when clearing all pieces for a -20 bonus!
          </div>
        </div>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // SLIDE 6: 4 PLAYERS - THE CLASSIC BATTLE
  // ---------------------------------------------------------------------------
  const renderSlide6 = () => (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 24,
        padding: '24px 20px',
        border: '1.5px solid #E2E8F0',
        boxShadow: '0 12px 36px rgba(0,0,0,0.06)',
        width: '100%',
        maxWidth: 680,
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}
    >
      {/* 4 Starting Corners (matching shared/board.ts & Slide 2) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
        <div style={{ background: '#EFF6FF', border: '1.5px solid #BFDBFE', padding: '12px 6px', borderRadius: 14 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#3E82F7', margin: '0 auto 6px auto', boxShadow: '0 2px 6px rgba(62, 130, 247, 0.4)' }} />
          <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#1E40AF' }}>Blue</div>
          <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, marginTop: 2 }}>Bottom-Left (1st)</div>
        </div>
        <div style={{ background: '#FEFCE8', border: '1.5px solid #FEF08A', padding: '12px 6px', borderRadius: 14 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#EAB308', margin: '0 auto 6px auto', boxShadow: '0 2px 6px rgba(234, 179, 8, 0.4)' }} />
          <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#854D0E' }}>Yellow</div>
          <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, marginTop: 2 }}>Top-Left (2nd)</div>
        </div>
        <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', padding: '12px 6px', borderRadius: 14 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#EF4444', margin: '0 auto 6px auto', boxShadow: '0 2px 6px rgba(239, 68, 68, 0.4)' }} />
          <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#991B1B' }}>Red</div>
          <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, marginTop: 2 }}>Top-Right (3rd)</div>
        </div>
        <div style={{ background: '#F0FDF4', border: '1.5px solid #BBF7D0', padding: '12px 6px', borderRadius: 14 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#22C55E', margin: '0 auto 6px auto', boxShadow: '0 2px 6px rgba(34, 197, 94, 0.4)' }} />
          <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#166534' }}>Green</div>
          <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, marginTop: 2 }}>Bottom-Right (4th)</div>
        </div>
      </div>

      {/* Clockwise Order */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          background: '#F8FAFC',
          padding: '14px 18px',
          borderRadius: 14,
          border: '1px solid #E2E8F0',
          fontSize: '0.88rem',
          color: '#334155',
          fontWeight: 700
        }}
      >
        <span style={{ fontSize: '1.2rem' }}>🔄</span>
        <span>Turns rotate clockwise: <strong>Blue ➔ Yellow ➔ Red ➔ Green</strong></span>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // SLIDE 7: 2 PLAYERS - THE DUO DUEL
  // ---------------------------------------------------------------------------
  const renderSlide7 = () => (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 24,
        padding: '24px 20px',
        border: '1.5px solid #E2E8F0',
        boxShadow: '0 12px 36px rgba(0,0,0,0.06)',
        width: '100%',
        maxWidth: 680,
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}
    >
      {/* 2 Player Teams */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <div style={{ background: '#EFF6FF', border: '1.5px solid #BFDBFE', borderRadius: 14, padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 900, color: '#1E40AF', marginBottom: 6 }}>PLAYER 1</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 900 }}>
            <span style={{ background: '#3E82F7', color: '#FFFFFF', padding: '4px 10px', borderRadius: 8, boxShadow: '0 2px 6px rgba(62, 130, 247, 0.3)' }}>🔵 Blue</span>
            <span style={{ background: '#EF4444', color: '#FFFFFF', padding: '4px 10px', borderRadius: 8, boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)' }}>🔴 Red</span>
          </div>
        </div>
        <div style={{ background: '#FEFCE8', border: '1.5px solid #FEF08A', borderRadius: 14, padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 900, color: '#854D0E', marginBottom: 6 }}>PLAYER 2</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 900 }}>
            <span style={{ background: '#EAB308', color: '#FFFFFF', padding: '4px 10px', borderRadius: 8, boxShadow: '0 2px 6px rgba(234, 179, 8, 0.3)' }}>🟡 Yellow</span>
            <span style={{ background: '#22C55E', color: '#FFFFFF', padding: '4px 10px', borderRadius: 8, boxShadow: '0 2px 6px rgba(34, 197, 94, 0.3)' }}>🟢 Green</span>
          </div>
        </div>
      </div>

      {/* Turn Sequence */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', padding: '10px 14px', borderRadius: 12, border: '1px solid #E2E8F0', fontSize: '0.78rem', fontWeight: 800, color: '#475569' }}>
        <span>1. 🔵 Blue (P1)</span>
        <ArrowRight size={14} color="#94A3B8" />
        <span>2. 🟡 Yellow (P2)</span>
        <ArrowRight size={14} color="#94A3B8" />
        <span>3. 🔴 Red (P1)</span>
        <ArrowRight size={14} color="#94A3B8" />
        <span>4. 🟢 Green (P2)</span>
      </div>

      {/* Simple Note */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#F8FAFC', padding: '12px 16px', borderRadius: 12, border: '1px solid #E2E8F0', fontSize: '0.84rem', color: '#334155', fontWeight: 700 }}>
        <span>🎮 Each player alternates between their two colors every turn.</span>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // SLIDE 8: 3 PLAYERS - THE COMMUNITY COLOR
  // ---------------------------------------------------------------------------
  const renderSlide8 = () => (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 24,
        padding: '24px 20px',
        border: '1.5px solid #E2E8F0',
        boxShadow: '0 12px 36px rgba(0,0,0,0.06)',
        width: '100%',
        maxWidth: 680,
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}
    >
      {/* 3 Players + Community Green */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '10px 4px', borderRadius: 12 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#1E40AF' }}>🔵 Blue</div>
          <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, marginTop: 2 }}>Player 1</div>
        </div>
        <div style={{ background: '#FEFCE8', border: '1px solid #FEF08A', padding: '10px 4px', borderRadius: 12 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#854D0E' }}>🟡 Yellow</div>
          <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, marginTop: 2 }}>Player 2</div>
        </div>
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '10px 4px', borderRadius: 12 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#991B1B' }}>🔴 Red</div>
          <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, marginTop: 2 }}>Player 3</div>
        </div>
        <div style={{ background: '#F0FDF4', border: '1.5px dashed #22C55E', padding: '10px 4px', borderRadius: 12, boxShadow: '0 2px 6px rgba(34,197,94,0.15)' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#166534' }}>🟢 Green</div>
          <div style={{ fontSize: '0.68rem', color: '#16A34A', fontWeight: 900, marginTop: 2 }}>Shared!</div>
        </div>
      </div>

      {/* Turn Sequence */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', padding: '10px 14px', borderRadius: 12, border: '1px solid #E2E8F0', fontSize: '0.78rem', fontWeight: 800, color: '#475569' }}>
        <span>1. 🔵 Blue (P1)</span>
        <ArrowRight size={14} color="#94A3B8" />
        <span>2. 🟡 Yellow (P2)</span>
        <ArrowRight size={14} color="#94A3B8" />
        <span>3. 🔴 Red (P3)</span>
        <ArrowRight size={14} color="#94A3B8" />
        <span>4. 🟢 Green (Shared)</span>
      </div>

      {/* Green Shared Rotation Note */}
      <div style={{ background: '#F0FDF4', padding: '12px 16px', borderRadius: 12, border: '1px solid #BBF7D0', fontSize: '0.84rem', color: '#166534', textAlign: 'center', fontWeight: 700 }}>
        🤝 <strong>Shared Green:</strong> P1 plays Green in Round 1, P2 in Round 2, P3 in Round 3 (repeats).
      </div>
    </div>
  );

  const slidesData = [
    {
      step: '01',
      category: 'PIECES',
      title: '21 Unique Pieces',
      description: 'Each player receives the same 21 shapes in their color.',
      renderContent: renderSlide1
    },
    {
      step: '02',
      category: 'FIRST MOVE',
      title: 'Start In Your Corner',
      description: 'Your first piece must cover your colored corner square.',
      renderContent: renderSlide2
    },
    {
      step: '03',
      category: 'CORNER RULE',
      title: 'Corners Kiss. Edges Don’t.',
      description: 'Your pieces must touch at corners — never along an edge.',
      renderContent: renderSlide3
    },
    {
      step: '04',
      category: 'OTHER COLORS',
      title: 'Opponents Touch Edges',
      description: 'Different colors may touch edges freely without restriction.',
      renderContent: renderSlide4
    },
    {
      step: '05',
      category: 'SCORING',
      title: 'Lowest Squares Wins',
      description: 'Count unplaced squares at game end · +15 bonus for clearing all pieces (+20 if 1-square is last).',
      renderContent: renderSlide5
    },
    {
      step: '06',
      category: '4 PLAYERS',
      title: '4 Players: Classic',
      description: '1 color each · Clockwise turns starting from your corner.',
      renderContent: renderSlide6
    },
    {
      step: '07',
      category: '2 PLAYERS',
      title: '2 Players: Duo Duel',
      description: '2 colors each · Alternate turns between both your colors.',
      renderContent: renderSlide7
    },
    {
      step: '08',
      category: '3 PLAYERS',
      title: '3 Players: Community',
      description: '1 color each · Green is shared in rotation each round.',
      renderContent: renderSlide8
    }
  ];

  const current = slidesData[currentSlide];

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        background: '#FAF9F6',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 'max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom)) 16px',
        maxWidth: 780,
        margin: '0 auto',
        boxSizing: 'border-box',
        overflowX: 'hidden'
      }}
    >
      {/* Top Header Bar */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16
          }}
        >
          {/* Back button */}
          <button
            onClick={handlePrev}
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              width: 48,
              height: 48,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#1E293B',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              transition: 'transform 0.1s ease'
            }}
            title="Back"
          >
            <ChevronLeft size={26} />
          </button>

          {/* Title Header */}
          <div style={{ textAlign: 'center' }}>
            <h1
              style={{
                fontSize: '1.18rem',
                fontWeight: 900,
                color: '#1E293B',
                letterSpacing: '0.8px',
                margin: 0
              }}
            >
              HOW TO PLAY
            </h1>
            <div
              style={{
                fontSize: '0.82rem',
                fontWeight: 800,
                color: '#94A3B8',
                letterSpacing: '0.5px',
                marginTop: 2
              }}
            >
              {currentSlide <= 4 ? `CLASSIC RULES · ${currentSlide + 1} OF 5` : current.category}
            </div>
          </div>

          {/* SKIP / CLOSE Button */}
          <button
            onClick={onBack}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1rem',
              fontWeight: 900,
              color: 'var(--primary-coral)',
              cursor: 'pointer',
              letterSpacing: '0.6px',
              padding: '10px 16px',
              borderRadius: 99,
              transition: 'opacity 0.15s ease'
            }}
            title="Close Guide"
          >
            CLOSE
          </button>
        </div>

        {/* Quick Mode Navigation Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginBottom: 18,
            overflowX: 'auto',
            paddingBottom: 4
          }}
        >
          {[
            { label: 'Core Rules', slideIndex: 0, isActive: currentSlide <= 4 },
            { label: '4 Players', slideIndex: 5, isActive: currentSlide === 5 },
            { label: '2 Players (1v1)', slideIndex: 6, isActive: currentSlide === 6 },
            { label: '3 Players (Trio)', slideIndex: 7, isActive: currentSlide === 7 }
          ].map(pill => (
            <button
              key={pill.label}
              type="button"
              onClick={() => {
                setSlideDirection(pill.slideIndex > currentSlide ? 'forward' : 'backward');
                setCurrentSlide(pill.slideIndex);
              }}
              style={{
                padding: '7px 14px',
                borderRadius: 999,
                border: pill.isActive ? '1.5px solid var(--primary-coral)' : '1px solid #E2E8F0',
                background: pill.isActive ? 'rgba(231, 114, 82, 0.12)' : '#FFFFFF',
                color: pill.isActive ? 'var(--primary-coral)' : '#64748B',
                fontSize: '0.82rem',
                fontWeight: pill.isActive ? 900 : 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                fontFamily: 'inherit',
                boxShadow: pill.isActive ? '0 2px 8px rgba(231, 114, 82, 0.15)' : 'none'
              }}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Slide Content with Animation */}
        <div
          key={currentSlide}
          style={{
            position: 'relative',
            marginTop: 8,
            animation: `${slideDirection === 'forward' ? 'carouselSlideRight' : 'carouselSlideLeft'} 0.24s cubic-bezier(0.16, 1, 0.3, 1)`
          }}
        >
          {/* Watermark Step Number */}
          <div
            style={{
              position: 'absolute',
              top: -16,
              left: 0,
              fontSize: '6.5rem',
              fontWeight: 900,
              color: 'rgba(231, 114, 82, 0.08)',
              lineHeight: 1,
              userSelect: 'none',
              pointerEvents: 'none',
              fontFamily: 'monospace'
            }}
          >
            {current.step}
          </div>

          {/* Category */}
          <div
            style={{
              fontSize: '0.88rem',
              fontWeight: 900,
              color: 'var(--primary-coral)',
              letterSpacing: '1px',
              marginBottom: 6,
              position: 'relative',
              zIndex: 2
            }}
          >
            {current.category}
          </div>

          {/* Headline */}
          <h2
            style={{
              fontSize: 'clamp(1.4rem, 3vw, 1.8rem)',
              fontWeight: 900,
              color: '#1E232A',
              marginBottom: 4,
              letterSpacing: '-0.4px',
              lineHeight: 1.15,
              position: 'relative',
              zIndex: 2
            }}
          >
            {current.title}
          </h2>

          {/* Subtitle / Description */}
          <p
            style={{
              fontSize: '0.88rem',
              color: '#64748B',
              fontWeight: 600,
              lineHeight: 1.4,
              marginBottom: 14,
              position: 'relative',
              zIndex: 2
            }}
          >
            {current.description}
          </p>

          {/* Graphic Visual Card */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            {current.renderContent()}
          </div>
        </div>
      </div>

      {/* Bottom Footer: Dots + Primary Button */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 14 }}>
        {/* Pagination Dots */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10
          }}
        >
          {slidesData.map((_, idx) => {
            const isActive = idx === currentSlide;
            return (
              <button
                key={idx}
                onClick={() => {
                  setSlideDirection(idx > currentSlide ? 'forward' : 'backward');
                  setCurrentSlide(idx);
                }}
                style={{
                  width: isActive ? 34 : 10,
                  height: 10,
                  borderRadius: 99,
                  background: isActive ? 'var(--primary-coral)' : '#CBD5E1',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                title={`Slide ${idx + 1}`}
              />
            );
          })}
        </div>

        {/* Primary Next / Let's Play Button */}
        <button
          onClick={handleNext}
          className="btn-coral"
          style={{
            width: '100%',
            padding: '18px 32px',
            fontSize: '1.15rem',
            letterSpacing: '0.5px'
          }}
        >
          {isLastSlide ? "LET'S PLAY" : 'NEXT'}
          <ArrowRight size={22} />
        </button>
      </div>
    </div>
  );
};
