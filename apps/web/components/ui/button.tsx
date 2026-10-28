import type { ButtonHTMLAttributes } from 'react';

/** Base compatível com a convenção shadcn/ui, mantida local para um MVP pequeno. */
export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`rounded-xl px-4 py-3 font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`} {...props} />;
}
