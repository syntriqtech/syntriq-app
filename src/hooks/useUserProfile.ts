"use client";

import { useEffect, useState } from "react";
import { fetchUserProfile, UserProfile } from "@/lib/userProfileDb";

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchUserProfile()
      .then(setProfile)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return { profile, isLoading };
}
