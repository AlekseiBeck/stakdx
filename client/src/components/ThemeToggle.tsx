import { Sun, Moon } from '@phosphor-icons/react';
import { useTheme } from '../ThemeContext';

interface ThemeToggleProps {
  /** Extra classes to size/position the button per surface. */
  className?: string;
}

/**
 * Sun / Moon toggle for light ⇄ dark. Used in the app Header and on the
 * landing / auth pages. Persistence + DOM updates live in ThemeContext.
 */
export default function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle color theme"
      className={`flex items-center justify-center rounded-lg border border-border text-muted hover:text-fg hover:border-border-strong transition-all duration-200 ease-out active:scale-90 ${className || 'w-9 h-9'}`}
    >
      {isDark ? <Sun size={18} weight="duotone" /> : <Moon size={18} weight="duotone" />}
    </button>
  );
}
