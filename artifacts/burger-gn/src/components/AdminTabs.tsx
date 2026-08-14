import React from 'react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';

type AdminTabBarProps = {
  children: React.ReactNode;
  className?: string;
  /** equal = stretch tabs to fill row (2–3 items). default = auto width + wrap on desktop */
  variant?: 'auto' | 'equal';
};

/**
 * Shared admin tab strip — visual only.
 * Desktop/notebook: wraps naturally (no pointless horizontal scrollbar).
 * Small screens: scrolls horizontally only when needed.
 */
export function AdminTabBar({ children, className, variant = 'auto' }: AdminTabBarProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'admin-tab-bar',
        variant === 'equal' && 'admin-tab-bar--equal',
        className,
      )}
    >
      {children}
    </div>
  );
}

type AdminTabProps = {
  active?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  title?: string;
};

export function AdminTab({
  active,
  onClick,
  icon,
  children,
  className,
  type = 'button',
  disabled,
  title,
}: AdminTabProps) {
  return (
    <button
      type={type}
      role="tab"
      aria-selected={!!active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn('admin-tab', active && 'admin-tab--active', className)}
    >
      {icon ? <span className="admin-tab__icon">{icon}</span> : null}
      <span className="admin-tab__label">{children}</span>
    </button>
  );
}

type AdminTabLinkProps = {
  href: string;
  active?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function AdminTabLink({ href, active, icon, children, className }: AdminTabLinkProps) {
  return (
    <Link href={href} className={cn('admin-tab-link', className)}>
      <span
        role="tab"
        aria-selected={!!active}
        className={cn('admin-tab', active && 'admin-tab--active')}
      >
        {icon ? <span className="admin-tab__icon">{icon}</span> : null}
        <span className="admin-tab__label">{children}</span>
      </span>
    </Link>
  );
}
