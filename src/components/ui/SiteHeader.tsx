'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';

interface SiteHeaderProps {
  /** Whether nav links point to in-page hashes (landing) or `/#hash` (other pages). */
  variant?: 'landing' | 'page';
  /** Show a "Log in" link to the staff/admin portal. */
  showStaffLogin?: boolean;
}

const NAV_LINKS = [
  { label: 'Our Services', hash: '#services' },
  { label: 'Pricing', hash: '#pricing' },
  { label: 'FAQ', hash: '#faq' },
];

export function SiteHeader({ variant = 'page', showStaffLogin = false }: SiteHeaderProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const goBook = () => router.push('/book');
  const href = (hash: string) => (variant === 'landing' ? hash : `/${hash}`);

  return (
    <header className="sticky top-0 z-50 bg-white/92 backdrop-blur-[6px] border-b border-[#efefef]">
      <div className="max-w-[1100px] mx-auto flex items-center justify-between px-6 md:px-10 lg:px-14 xl:px-20 2xl:px-28 py-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="bg-[#e8620a] flex items-center justify-center rounded-[10px] size-[38px] shrink-0">
            <span className="flex gap-[2px] items-end">
              <span className="bg-white h-[11px] w-[5px] rounded-[1px]" />
              <span className="bg-white h-[16px] w-[5px] rounded-[1px]" />
              <span className="bg-white h-[13px] w-[5px] rounded-[1px]" />
            </span>
          </span>
          <span className="hidden sm:inline font-extrabold text-[#0a0a0a] text-[19px] tracking-[-0.38px] whitespace-nowrap">
            Luggage Storage Colombo
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-[34px]">
          {NAV_LINKS.map((link) => (
            <a
              key={link.hash}
              href={href(link.hash)}
              className="font-medium text-[#3a3a3a] text-[15px] hover:text-[#e8620a] transition-colors"
            >
              {link.label}
            </a>
          ))}
          {showStaffLogin && (
            <Link
              href="/login"
              className="font-medium text-[#3a3a3a] text-[15px] hover:text-[#e8620a] transition-colors"
            >
              Staff Log in
            </Link>
          )}
          <button
            onClick={goBook}
            className="bg-[#e8620a] hover:bg-[#d1560a] transition-colors px-6 py-[13px] rounded-[100px] font-bold text-[15px] text-white whitespace-nowrap"
          >
            Book Storage Now
          </button>
        </nav>

        <button
          className="md:hidden p-2 rounded-full hover:bg-stone-100 transition-colors"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-[#efefef] bg-white px-6 py-4 flex flex-col gap-3">
          {NAV_LINKS.map((link) => (
            <a
              key={link.hash}
              href={href(link.hash)}
              onClick={() => setMobileOpen(false)}
              className="font-medium text-[#3a3a3a] text-[15px] py-1"
            >
              {link.label}
            </a>
          ))}
          {showStaffLogin && (
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="font-medium text-[#3a3a3a] text-[15px] py-1"
            >
              Staff Log in
            </Link>
          )}
          <button
            onClick={() => { setMobileOpen(false); goBook(); }}
            className="bg-[#e8620a] px-6 py-3 rounded-[100px] font-bold text-[15px] text-white mt-2"
          >
            Book Storage Now
          </button>
        </div>
      )}
    </header>
  );
}
