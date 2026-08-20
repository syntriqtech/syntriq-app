"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sampleUser, getContractorInfo } from "@/lib/sampleUser";
import { createClient } from "@/lib/supabase/client";
import { usePlan } from "@/hooks/usePlan";
import PlanBadge from "@/components/PlanBadge";

const MENU_ITEMS = [
  { label: "Account settings", href: "/account-settings" },
  { label: "Company profile",  href: "/company-profile" },
  { label: "Team & Users",     href: "/team-users" },
  { label: "Customers",        href: "/customers" },
  { label: "Billing & plan",   href: "/billing-plan" },
];

export default function AccountMenu() {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState(sampleUser);
  const { plan } = usePlan();

  useEffect(() => {
    getContractorInfo().then(setUser).catch(() => {});

    const handler = () => getContractorInfo().then(setUser).catch(() => {});
    window.addEventListener("company-profile-updated", handler);
    return () => window.removeEventListener("company-profile-updated", handler);
  }, []);

  async function handleLogout() {
    setOpen(false);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative mt-auto border-t border-gray-100 pt-4"
    >
      {open && (
        <div className="absolute bottom-[62px] left-0 right-0 rounded-[13px] border border-gray-100 bg-white p-1.5 shadow-lg">
          <div className="mb-1.5 border-b border-gray-100 px-2.5 pb-2.5 pt-1.5">
            <div className="text-sm font-bold text-navy">{user.name}</div>
            <div className="mt-0.5 text-xs text-gray-500">{user.email}</div>
          </div>

          <div className="flex flex-col">
            {MENU_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-navy hover:bg-gray-50"
              >
                <span className="h-[15px] w-[15px] flex-none rounded-[4px] bg-gray-400/50" />
                {item.label}
              </Link>
            ))}
          </div>

          <div className="my-1.5 h-px bg-gray-100" />

          <div className="flex flex-col">
            <Link
              href="/help-support"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-navy hover:bg-gray-50"
            >
              <span className="h-[15px] w-[15px] flex-none rounded-[4px] bg-gray-400/50" />
              Help & support
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-red-600 hover:bg-gray-50"
            >
              <span className="h-[15px] w-[15px] flex-none rounded-[4px] bg-red-400/60" />
              Log out
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center gap-2.5 rounded-lg border px-2 py-2.5 text-left transition-colors ${
          open
            ? "border-gray-200 bg-gray-50"
            : "border-transparent hover:border-gray-200 hover:bg-gray-50"
        }`}
      >
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-navy text-sm font-bold text-white">
          {user.initials}
        </span>
        <span className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[13.5px] font-bold leading-tight text-navy">
              {user.name.split(" ")[0]}
            </div>
            {plan && <PlanBadge plan={plan} />}
          </div>
          <div className="truncate text-[11.5px] text-gray-500">
            {user.company}
          </div>
        </span>
        <span
          className={`flex-none text-gray-400 transition-transform ${
            open ? "rotate-180" : "rotate-0"
          }`}
        >
          ⌃
        </span>
      </button>
    </div>
  );
}
