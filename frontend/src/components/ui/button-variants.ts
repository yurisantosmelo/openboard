import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  "[--control-icon-color:currentColor] relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[var(--control-radius)] border font-medium text-sm outline-none transition-[color,background-color,border-color,box-shadow,scale] active:scale-[0.97] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--control-radius)-1px)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 aria-disabled:pointer-events-none aria-disabled:opacity-64 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-[var(--control-icon-color)]",
  {
    variants: {
      variant: {
        default:
          'not-disabled:inset-shadow-[0_1px_rgb(255_255_255/16%)] border-primary bg-primary text-primary-foreground shadow-xs shadow-primary/24 active:inset-shadow-[0_1px_rgb(0_0_0/8%)] active:shadow-none disabled:shadow-none hover:bg-primary/90',
        destructive:
          'not-disabled:inset-shadow-[0_1px_rgb(255_255_255/16%)] border-destructive bg-destructive text-white shadow-xs shadow-destructive/24 active:inset-shadow-[0_1px_rgb(0_0_0/8%)] active:shadow-none disabled:shadow-none hover:bg-destructive/90',
        'destructive-outline':
          'border-input bg-popover not-dark:bg-clip-padding text-destructive-foreground shadow-xs/5 not-disabled:not-active:before:shadow-[0_1px_rgb(0_0_0/4%)] dark:bg-input/32 dark:not-disabled:not-active:before:shadow-[0_-1px_rgb(255_255_255/6%)] disabled:shadow-none hover:border-destructive/32 hover:bg-destructive/4',
        outline:
          '[--control-icon-color:var(--contrast-muted-foreground)] border-input bg-popover not-dark:bg-clip-padding text-foreground shadow-xs/5 not-disabled:not-active:before:shadow-[0_1px_rgb(0_0_0/4%)] dark:bg-input/32 dark:not-disabled:not-active:before:shadow-[0_-1px_rgb(255_255_255/6%)] disabled:shadow-none hover:bg-accent/50 dark:hover:bg-input/64',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/90 active:bg-secondary/80',
        ghost:
          '[--control-icon-color:var(--contrast-muted-foreground)] border-transparent text-foreground hover:bg-accent',
        glass:
          'surface-glass [--control-icon-color:var(--contrast-muted-foreground)] rounded-full border-border/60 text-foreground shadow-sm before:rounded-full hover:border-border',
        'warning-outline':
          'border-warning/32 bg-warning-surface text-warning-foreground shadow-xs/5 hover:border-warning/40 hover:bg-warning/16 dark:hover:bg-warning/24',
        link: 'border-transparent text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3 sm:h-8',
        compact:
          "h-7 gap-1.5 rounded-md px-2 text-xs before:rounded-[calc(var(--radius-md)-1px)] [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-7 gap-1.5 rounded-md px-2 text-xs sm:h-6 [&_svg:not([class*='size-'])]:size-3.5",
        sm: 'h-8 gap-1.5 px-2.5 sm:h-7',
        lg: 'h-10 px-4 sm:h-9',
        icon: 'size-9 sm:size-8',
        'icon-xs': "size-7 sm:size-6 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-sm': 'size-8 sm:size-7',
        'icon-lg': 'size-10 sm:size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);
