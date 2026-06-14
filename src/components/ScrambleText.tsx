import React, { useState, useEffect, useRef } from 'react';

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%*+=|/<>!?_';

function buildFrame(target: string, progress: number): string {
  const revealCount = Math.floor(progress * target.length);
  return target
    .split('')
    .map((c, i) => {
      if (c === ' ') return ' ';
      if (i < revealCount) return c;
      return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    })
    .join('');
}

interface ScrambleCycleProps {
  /** Words to cycle through */
  words: string[];
  /** Milliseconds between word transitions */
  interval?: number;
  /** Milliseconds to fully reveal each word */
  duration?: number;
  className?: string;
}

/**
 * Cycles through an array of words with a scramble-reveal animation.
 */
export function ScrambleCycle({
  words,
  interval = 2500,
  duration = 700,
  className,
}: ScrambleCycleProps) {
  const [text, setText] = useState<string>(() => words[0] ?? '');
  const wordsRef = useRef(words);
  const durationRef = useRef(duration);
  const idxRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    function run(target: string) {
      cancelAnimationFrame(rafRef.current);
      const t0 = performance.now();
      function tick(now: number) {
        const p = Math.min((now - t0) / durationRef.current, 1);
        setText(buildFrame(target, p));
        if (p < 1) rafRef.current = requestAnimationFrame(tick);
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    idxRef.current = 0;
    run(wordsRef.current[0] ?? '');

    const timer = setInterval(() => {
      idxRef.current = (idxRef.current + 1) % wordsRef.current.length;
      run(wordsRef.current[idxRef.current]);
    }, interval);

    return () => {
      clearInterval(timer);
      cancelAnimationFrame(rafRef.current);
    };
  }, [interval]);

  return <span className={className}>{text}</span>;
}

interface ScrambleRevealProps {
  /** The text to reveal */
  text: string;
  /** Milliseconds to complete the reveal */
  duration?: number;
  /** Milliseconds before starting */
  delay?: number;
  className?: string;
}

/**
 * One-shot scramble-reveal of a specific text string.
 * Re-plays whenever `text` changes.
 */
export function ScrambleReveal({
  text,
  duration = 900,
  delay = 0,
  className,
}: ScrambleRevealProps) {
  const [displayed, setDisplayed] = useState<string>(() => buildFrame(text, 0));
  const rafRef = useRef<number>(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    // Start with all scrambled
    setDisplayed(buildFrame(text, 0));

    const startTime = performance.now() + delay;

    function tick(now: number) {
      if (now < startTime) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const p = Math.min((now - startTime) / duration, 1);
      setDisplayed(buildFrame(text, p));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, duration, delay]);

  return <span className={className}>{displayed}</span>;
}

