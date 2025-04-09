import { cn } from '../../helpers/cn';

export type SpinnerSize = 'sm' | 'md' | 'lg';
export type SpinnerTheme = 'light' | 'dark';

export function Spinner({ size = 'sm', theme = 'light' }: { size?: SpinnerSize; theme?: SpinnerTheme }) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  };

  const themeClasses = {
    light: 'border-white',
    dark: 'border-gray-600 ',
  };

  return (
    <div
      className={cn(
        themeClasses[theme],
        'border-t-transparent rounded-full animate-spin border-[2.5px]',
        sizeClasses[size],
      )}
    />
  );
}
