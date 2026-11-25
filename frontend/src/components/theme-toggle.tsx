import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme, type ThemePreference } from '@/hooks/use-theme';

const themeLabels: Record<ThemePreference, string> = {
  system: 'Theme: System (click to switch to Light)',
  light: 'Theme: Light (click to switch to Dark)',
  dark: 'Theme: Dark (click to switch to System)',
};

function ThemeIcon({ theme }: { theme: ThemePreference }) {
  if (theme === 'light') return <Sun aria-hidden="true" />;
  if (theme === 'dark') return <Moon aria-hidden="true" />;
  return <Monitor aria-hidden="true" />;
}

/** Compact theme switcher cycling System, Light, and Dark modes. */
export function ThemeToggle() {
  const { theme, cycleTheme } = useTheme();
  const label = themeLabels[theme];

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={cycleTheme}
    >
      <ThemeIcon theme={theme} />
    </Button>
  );
}
