import React from 'react';
import { X, Check, Search, Volume2, Sliders, MousePointer } from 'lucide-react';
import { PlacementMode } from '../../../shared/index.ts';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  placementMode: PlacementMode;
  onChangePlacementMode: (mode: PlacementMode) => void;
  loupeEnabled: boolean;
  onToggleLoupe: (enabled: boolean) => void;
  soundEnabled: boolean;
  onToggleSound: (enabled: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  placementMode,
  onChangePlacementMode,
  loupeEnabled,
  onToggleLoupe,
  soundEnabled,
  onToggleSound
}) => {
  if (!isOpen) return null;

  const MODES: {
    id: PlacementMode;
    title: string;
    description: string;
    tag?: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'CIRCULAR_BUTTON',
      title: 'Floating Check Button',
      tag: 'RECOMMENDED',
      description: 'A circular green checkmark appears directly on the board over valid moves. Tap it to place instantly.',
      icon: (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(34, 197, 94, 0.4)',
            color: '#FFFFFF'
          }}
        >
          <Check size={18} strokeWidth={3.5} />
        </div>
      )
    },
    {
      id: 'DOUBLE_TAP',
      title: 'Double Tap on Board',
      description: 'Tap once to preview the piece on the board, tap the piece a second time to lock it in and confirm.',
      icon: (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#EFF6FF',
            border: '2px solid #3B82F6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2563EB',
            fontWeight: 900,
            fontSize: '0.85rem'
          }}
        >
          2×
        </div>
      )
    },
    {
      id: 'BOTTOM_BUTTON',
      title: 'Bottom Bar Button Only',
      description: 'Classic layout: tap the board to position your piece, then tap the large "PLACE PIECE" button below.',
      icon: (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: '#FEF2F2',
            border: '2px solid #F87171',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#EF4444'
          }}
        >
          <MousePointer size={16} strokeWidth={2.5} />
        </div>
      )
    }
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10010,
        padding: 16
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#FFFFFF',
          borderRadius: 24,
          padding: '22px 20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          animation: 'bounceSubtle 0.18s ease-out',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 18,
            borderBottom: '1px solid #F1F5F9',
            paddingBottom: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#F1F5F9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#334155'
              }}
            >
              <Sliders size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 900, color: '#1E293B', margin: 0 }}>
                Control & Game Settings
              </h3>
              <p style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, margin: 0 }}>
                Customize how you place pieces and view the board
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748B'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Section 1: Placement Confirmation Mode */}
        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.78rem',
              fontWeight: 900,
              color: '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              marginBottom: 10
            }}
          >
            Placement Confirmation Mode
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {MODES.map((mode) => {
              const isSelected = placementMode === mode.id;

              return (
                <div
                  key={mode.id}
                  onClick={() => onChangePlacementMode(mode.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 16,
                    background: isSelected ? '#F0FDF4' : '#FAFAFA',
                    border: isSelected ? '2px solid #22C55E' : '1.5px solid #E2E8F0',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 4px 12px rgba(34, 197, 94, 0.12)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ flexShrink: 0, marginTop: 2 }}>{mode.icon}</div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span
                        style={{
                          fontWeight: 800,
                          fontSize: '0.9rem',
                          color: isSelected ? '#15803D' : '#1E293B'
                        }}
                      >
                        {mode.title}
                      </span>
                      {mode.tag && (
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 900,
                            background: '#DCFCE7',
                            color: '#15803D',
                            padding: '2px 7px',
                            borderRadius: 99,
                            letterSpacing: '0.4px'
                          }}
                        >
                          {mode.tag}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#64748B', lineHeight: 1.4, margin: 0, fontWeight: 500 }}>
                      {mode.description}
                    </p>
                  </div>

                  {/* Radio Indicator */}
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: isSelected ? '5px solid #22C55E' : '2px solid #CBD5E1',
                      background: '#FFFFFF',
                      flexShrink: 0,
                      marginTop: 4
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: Touch Precision & Toggles */}
        <div style={{ marginBottom: 22 }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.78rem',
              fontWeight: 900,
              color: '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              marginBottom: 10
            }}
          >
            Touch & Audio Preferences
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Magnifier Loupe Toggle */}
            <div
              onClick={() => onToggleLoupe(!loupeEnabled)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 14,
                background: '#FAFAFA',
                border: '1.5px solid #E2E8F0',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: '#F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#3B82F6'
                  }}
                >
                  <Search size={17} strokeWidth={2.5} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#1E293B' }}>
                    Pixel Art Magnifier Loupe
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500 }}>
                    Zoom popup above finger during drag
                  </div>
                </div>
              </div>

              {/* iOS Switch */}
              <div
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: 99,
                  background: loupeEnabled ? '#22C55E' : '#CBD5E1',
                  position: 'relative',
                  transition: 'background 0.2s ease',
                  flexShrink: 0
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#FFFFFF',
                    position: 'absolute',
                    top: 3,
                    left: loupeEnabled ? 21 : 3,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                />
              </div>
            </div>

            {/* Sound FX Toggle */}
            <div
              onClick={() => onToggleSound(!soundEnabled)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 14,
                background: '#FAFAFA',
                border: '1.5px solid #E2E8F0',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: '#F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#10B981'
                  }}
                >
                  <Volume2 size={17} strokeWidth={2.5} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#1E293B' }}>
                    Game Sound FX
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500 }}>
                    Audio feedback for turns & placement
                  </div>
                </div>
              </div>

              {/* iOS Switch */}
              <div
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: 99,
                  background: soundEnabled ? '#22C55E' : '#CBD5E1',
                  position: 'relative',
                  transition: 'background 0.2s ease',
                  flexShrink: 0
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#FFFFFF',
                    position: 'absolute',
                    top: 3,
                    left: soundEnabled ? 21 : 3,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Done / Save Button */}
        <button
          type="button"
          onClick={onClose}
          className="btn-coral"
          style={{
            width: '100%',
            padding: '13px',
            fontSize: '0.96rem',
            borderRadius: 14,
            fontWeight: 800
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
};
