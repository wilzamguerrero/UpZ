import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ScrambleCycle } from './ScrambleText';

const LOADER_WORDS = [
  'ENVI',
  'RÁPIDO',
  'SIMPLE',
  'DISEÑO',
  'VELOZ',
  'NOTION',
  'LIMPIO',
  'DROPS',
  'SEGURO',
  'FLUIDO',
];

interface AppLoaderProps {
  visible: boolean;
  bgColor?: string;
  isLight?: boolean;
  textColor?: string;
}

export default function AppLoader({ visible, bgColor, isLight, textColor }: AppLoaderProps) {
  const finalBgColor = bgColor || 'var(--loader-bg, var(--app-bg, #050505))';
  const finalTextColor = textColor || (isLight ? '#111111' : '#ffffff');

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="app-loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: [0.25, 0, 0.2, 1] } }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none"
          style={{
            backgroundColor: finalBgColor,
            transition: 'background-color 0.35s ease',
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0, 0.2, 1] }}
            className="text-center"
          >
            {/* Big scramble cycling word */}
            <div
              className="font-mono font-bold leading-none tracking-tighter"
              style={{
                fontSize: 'clamp(3rem, 12vw, 7rem)',
                color: finalTextColor,
              }}
            >
              <ScrambleCycle
                words={LOADER_WORDS}
                interval={1600}
                duration={550}
              />
            </div>

            {/* Subtitle */}
            <div
              className="mt-5 text-[10px] font-mono uppercase tracking-[0.35em]"
              style={{ color: isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.2)' }}
            >
              envi
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
