/**
 * App chrome: a hairline top bar and the content column. Nothing else — the chrome's job is to
 * disappear behind the page.
 *
 * The bar is the only fixed furniture in the app, so it stays short (48px) and the lesson toolbar
 * sticks directly beneath it. Everything works down to ~400px, which is also the future mobile
 * layout: the nav labels stay put, the wordmark shortens.
 */
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

const NAV = [
  { to: '/', label: 'Curriculum', end: true },
  { to: '/review', label: 'Review', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:border focus:border-rule-strong focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-rule bg-paper/95 backdrop-blur-[2px]">
        <nav aria-label="Main" className="mx-auto flex h-12 max-w-app items-center gap-1 px-4 sm:px-6">
          <NavLink to="/" className="mr-auto flex items-baseline gap-2 pr-3">
            <span aria-hidden="true" className="h-3 w-[2px] shrink-0 self-center bg-accent" />
            <span className="label text-ink">
              <span className="sm:hidden">ITMC</span>
              <span className="hidden sm:inline">IT Manager Curriculum</span>
            </span>
          </NavLink>
          {NAV.slice(1).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `label px-2.5 py-2 transition-colors ${isActive ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`
              }
            >
              {({ isActive }) => (
                <span className={isActive ? 'border-b border-accent pb-[3px]' : 'border-b border-transparent pb-[3px]'}>
                  {item.label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-app px-4 pb-24 pt-7 sm:px-6">
        {children}
      </main>
    </div>
  );
}
