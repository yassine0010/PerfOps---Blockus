import React from 'react';
import { Gamepad2, Trophy, User } from 'lucide-react';

export type TabId = 'PLAY' | 'LEADERBOARD' | 'PROFILE';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> }[] = [
  { id: 'PLAY', label: 'Play', Icon: Gamepad2 },
  { id: 'LEADERBOARD', label: 'Rankings', Icon: Trophy },
  { id: 'PROFILE', label: 'Profile', Icon: User },
];

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  return (
    <div
      className="bottom-nav"
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(232, 236, 239, 0.8)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingTop: 6,
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        zIndex: 900,
        boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.06)'
      }}
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '6px 22px',
              border: 'none',
              background: isActive ? 'rgba(231, 114, 82, 0.1)' : 'transparent',
              borderRadius: 14,
              cursor: 'pointer',
              color: isActive ? '#E77252' : '#94A3B8',
              transition: 'all 0.2s ease',
              fontFamily: 'inherit',
              position: 'relative'
            }}
          >
            {/* Active dot indicator */}
            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  top: -6,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: '#E77252',
                  boxShadow: '0 0 6px rgba(231, 114, 82, 0.5)'
                }}
              />
            )}
            <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: isActive ? 900 : 700,
                letterSpacing: '0.4px'
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
