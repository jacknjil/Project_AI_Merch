import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', ...props }, ref) => {
    
    const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
    
    const variants = {
      primary: 'bg-primary text-secondary hover:bg-primary/90',
      secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
      accent: 'bg-accent text-primary hover:bg-accent/90',
      outline: 'border border-gray-200 hover:bg-gray-100 text-gray-900'
    };

    const sizes = {
      sm: 'h-9 px-3 text-xs',
      md: 'h-10 px-4 py-2',
      lg: 'h-11 px-8'
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
