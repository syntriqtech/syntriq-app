"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import AccountMenu from "@/components/AccountMenu";
import TrialStatusBanner from "@/components/TrialStatusBanner";
import { useCoExposure } from "@/hooks/useCoExposure";
import { useRetentionBadge } from "@/hooks/useRetentionBadge";
import { useBillingCheckinBadge } from "@/hooks/useBillingCheckinBadge";
import { useSidebarPrefs } from "@/hooks/useSidebarPrefs";

type NavItem = {
  label: string;
  href: string;
  badge?: "co" | "checkin" | "retention";
  pinned?: boolean;
};

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",          href: "/dashboard",       pinned: true },
  { label: "Job Setup",          href: "/job-setup" },
  { label: "Job List",           href: "/jobs" },
  { label: "AR Aging Summary",   href: "/billing-summary" },
  { label: "Record Payment",     href: "/pay-applications" },
  { label: "Billing Check-in",   href: "/billing-checkin", badge: "checkin" },
  { label: "Create Pay App",     href: "/sov" },
  { label: "Change Orders",      href: "/change-orders",   badge: "co" },
  { label: "Retention",          href: "/retention",       badge: "retention" },
  { label: "Archive",            href: "/archive" },
  { label: "G702 Cover Sheet",   href: "/g702" },
  { label: "Invoice Cover",      href: "/invoice-cover" },
  { label: "Lien Waivers",       href: "/lien-waivers" },
  { label: "Download Package",   href: "/download-package" },
  { label: "Reports",            href: "/reports" },
];

// ── Icons ────────────────────────────────────────────────────────────────────

function GearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const { readyToApplyCount } = useCoExposure();
  const { readyToBillCount }  = useRetentionBadge();
  const { pendingCount: checkinPendingCount } = useBillingCheckinBadge();
  const { tabOrder, hiddenTabs, updateOrder, toggleHidden } = useSidebarPrefs();

  const [editMode, setEditMode] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragCounter = useRef(0); // tracks nested dragenter/dragleave

  // Apply saved order on top of the canonical DEFAULT_NAV_ITEMS list.
  // Any new items added to DEFAULT_NAV_ITEMS that aren't in the saved order
  // are appended at the end so they automatically show up for existing users.
  const orderedItems = useMemo<NavItem[]>(() => {
    if (tabOrder.length === 0) return DEFAULT_NAV_ITEMS;
    const ordered: NavItem[] = [];
    for (const href of tabOrder) {
      const item = DEFAULT_NAV_ITEMS.find((i) => i.href === href);
      if (item) ordered.push(item);
    }
    for (const item of DEFAULT_NAV_ITEMS) {
      if (!tabOrder.includes(item.href)) ordered.push(item);
    }
    return ordered;
  }, [tabOrder]);

  // In normal mode, hidden tabs are fully removed.
  // In edit mode, all tabs show (hidden ones are dimmed).
  const visibleItems = editMode
    ? orderedItems
    : orderedItems.filter((item) => !hiddenTabs.has(item.href));

  function getBadgeCount(item: NavItem): number | null {
    if (item.badge === "co"      && readyToApplyCount  > 0) return readyToApplyCount;
    if (item.badge === "retention" && readyToBillCount  > 0) return readyToBillCount;
    if (item.badge === "checkin" && checkinPendingCount > 0) return checkinPendingCount;
    return null;
  }

  // ── Drag-and-drop handlers ────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, idx: number) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  }

  function handleDragEnter(e: React.DragEvent, idx: number) {
    e.preventDefault();
    dragCounter.current += 1;
    setDragOverIdx(idx);
  }

  function handleDragLeave() {
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setDragOverIdx(null);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent, dropIdx: number) {
    e.preventDefault();
    dragCounter.current = 0;
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const next = [...orderedItems];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(dropIdx, 0, moved);
    updateOrder(next.map((item) => item.href));
    setDragIdx(null);
    setDragOverIdx(null);
  }

  function handleDragEnd() {
    dragCounter.current = 0;
    setDragIdx(null);
    setDragOverIdx(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <aside className="sticky top-0 flex h-screen w-56 flex-none flex-col border-r border-gray-100 bg-white px-4 py-6">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2">
        <Image src="/SyntriqLogo2.png" alt="Syntriq" width={32} height={32} />
        <span className="text-lg font-semibold text-navy">Syntriq</span>
      </div>

      {/* Nav items */}
      <nav className="mt-8 flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {visibleItems.map((item, idx) => {
          const isHidden  = hiddenTabs.has(item.href);
          const isActive  = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
          const badge     = getBadgeCount(item);
          const isDragTarget = editMode && dragOverIdx === idx && dragIdx !== idx;

          if (editMode) {
            return (
              <div
                key={item.href}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragEnter={(e) => handleDragEnter(e, idx)}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                className={[
                  "flex items-center gap-1.5 rounded-lg px-2 py-1.5 select-none cursor-grab active:cursor-grabbing transition-colors",
                  isDragTarget ? "bg-teal/10 ring-1 ring-inset ring-teal/30" : "hover:bg-gray-50",
                  isHidden ? "opacity-40" : "",
                ].join(" ")}
              >
                {/* Drag handle */}
                <span className="flex-none text-[11px] leading-none text-gray-300 font-bold tracking-tighter">
                  ⠿
                </span>

                {/* Label */}
                <span className="flex-1 truncate text-sm font-medium text-gray-600">
                  {item.label}
                </span>

                {/* Badge (non-interactive in edit mode, only when visible) */}
                {badge !== null && !isHidden && (
                  <span className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold text-white ${
                    item.badge === "checkin" ? "bg-teal" : "bg-amber-400"
                  }`}>
                    {badge}
                  </span>
                )}

                {/* Eye toggle — not available for pinned (Dashboard) */}
                {item.pinned ? (
                  <span className="flex-none w-[18px]" /> /* spacer to keep alignment */
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleHidden(item.href)}
                    title={isHidden ? "Show in sidebar" : "Hide from sidebar"}
                    className="flex-none text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    {isHidden ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                )}
              </div>
            );
          }

          // ── Normal (non-edit) mode ──
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-teal/10 text-navy"
                  : "text-gray-500 hover:bg-gray-50 hover:text-navy"
              }`}
            >
              {item.label}
              {badge !== null && (
                <span className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold text-white ${
                  item.badge === "checkin" ? "bg-teal" : "bg-amber-400"
                }`}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Customize / Done toggle */}
      <div className="mt-3 mb-2 px-1">
        {editMode ? (
          <button
            type="button"
            onClick={() => setEditMode(false)}
            className="flex items-center gap-1.5 text-xs font-semibold text-teal hover:text-teal/80 transition-colors"
          >
            <CheckIcon />
            Done
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            title="Customize sidebar"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-500 transition-colors"
          >
            <GearIcon />
            Customize
          </button>
        )}
      </div>

      <TrialStatusBanner />
      <AccountMenu />
    </aside>
  );
}
