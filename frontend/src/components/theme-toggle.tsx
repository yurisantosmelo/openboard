import { Contrast, Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { useTheme, type ThemePreference } from '@/hooks/use-theme';

const themeLabels: Record<ThemePreference, string> = {
  system: 'Theme: System (click to switch to Light)',
  light: 'Theme: Light (click to switch to Dark)',
  dark: 'Theme: Dark (click to switch to System)',
};

function ThemeIcon({ theme }: { theme: ThemePreference }) {
  if (theme === 'light') return <Sun aria-hidden="true" />;
  if (theme === 'dark') return <Moon aria-hidden="true" />;
  return <Contrast aria-hidden="true" />;
}

/** Compact theme switcher cycling System, Light, and Dark modes. */
export function ThemeToggle() {
  const { theme, cycleTheme } = useTheme();
  const label = themeLabels[theme];

  return (
    <IconButton
      variant="outline"
      size="md"
      aria-label={label}
      title={label}
      className="[&_svg]:size-3.5"
      onClick={cycleTheme}
    >
      <ThemeIcon theme={theme} />
    </IconButton>
  );
}
