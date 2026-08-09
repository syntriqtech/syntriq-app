"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSidebarPrefs, saveSidebarPrefs } from "@/lib/sidebarPrefsDb";

export function useSidebarPrefs() {
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const [hiddenTabs, setHiddenTabs] = useState<Set<string>>(new Set());

  const orderRef  = useRef<string[]>([]);
  const hiddenRef = useRef<Set<string>>(new Set());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    fetchSidebarPrefs()
      .then((prefs) => {
        if (!prefs) return;
        if (prefs.tabOrder.length > 0) {
          setTabOrder(prefs.tabOrder);
          orderRef.current = prefs.tabOrder;
        }
        if (prefs.hiddenTabs.length > 0) {
          const set = new Set(prefs.hiddenTabs);
          setHiddenTabs(set);
          hiddenRef.current = set;
        }
      })
      .catch(() => {});

    return () => clearTimeout(saveTimer.current);
  }, []);

  function scheduleSave() {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveSidebarPrefs(orderRef.current, [...hiddenRef.current]).catch(() => {});
    }, 600);
  }

  function updateOrder(order: string[]) {
    orderRef.current = order;
    setTabOrder(order);
    scheduleSave();
  }

  function toggleHidden(href: string) {
    const next = new Set(hiddenRef.current);
    if (next.has(href)) next.delete(href);
    else next.add(href);
    hiddenRef.current = next;
    setHiddenTabs(new Set(next));
    scheduleSave();
  }

  return { tabOrder, hiddenTabs, updateOrder, toggleHidden };
}
