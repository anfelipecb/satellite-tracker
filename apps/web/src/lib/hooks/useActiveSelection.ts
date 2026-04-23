'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSupabaseBrowser } from '@/lib/supabase/browser';

export type UserUiStateRow = {
  active_location_id: string | null;
  active_norad_id: number | null;
};

type UpsertPayload = {
  user_id: string;
  active_location_id: string | null;
  active_norad_id: number | null;
  updated_at: string;
};

export function useActiveSelection(userId: string | undefined) {
  const supabase: SupabaseClient = useSupabaseBrowser();
  const [activeLocationId, setActiveLocationIdState] = useState<string | null>(null);
  const [activeNoradId, setActiveNoradIdState] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const latestRef = useRef<UserUiStateRow>({ active_location_id: null, active_norad_id: null });
  const userIdRef = useRef<string | undefined>(userId);
  userIdRef.current = userId;

  useEffect(() => {
    latestRef.current = { active_location_id: activeLocationId, active_norad_id: activeNoradId };
  }, [activeLocationId, activeNoradId]);

  // Initial load
  useEffect(() => {
    if (!userId) {
      setActiveLocationIdState(null);
      setActiveNoradIdState(null);
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_ui_state')
        .select('active_location_id, active_norad_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('user_ui_state load', error);
        setReady(true);
        return;
      }
      if (data) {
        setActiveLocationIdState(data.active_location_id);
        setActiveNoradIdState(data.active_norad_id);
        latestRef.current = { active_location_id: data.active_location_id, active_norad_id: data.active_norad_id };
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, supabase]);

  const upsert = useCallback(
    async (locationId: string | null, noradId: number | null) => {
      const uid = userIdRef.current;
      if (!uid) return;
      const row: UpsertPayload = {
        user_id: uid,
        active_location_id: locationId,
        active_norad_id: noradId,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('user_ui_state').upsert(row, { onConflict: 'user_id' });
      if (error) console.error('user_ui_state upsert', error);
    },
    [supabase]
  );

  const setActiveLocationId = useCallback(
    (id: string | null) => {
      setActiveLocationIdState(id);
      const norad = latestRef.current.active_norad_id;
      latestRef.current = { active_location_id: id, active_norad_id: norad };
      void upsert(id, norad);
    },
    [upsert]
  );

  const setActiveNoradId = useCallback(
    (norad: number | null) => {
      setActiveNoradIdState(norad);
      const loc = latestRef.current.active_location_id;
      latestRef.current = { active_location_id: loc, active_norad_id: norad };
      void upsert(loc, norad);
    },
    [upsert]
  );

  /** Call after user_locations load: pick first if current is missing or null. */
  const reconcileLocationIds = useCallback(
    (validIds: string[]) => {
      if (!userId || !ready) return;
      if (!validIds.length) {
        if (activeLocationId !== null) {
          setActiveLocationIdState(null);
          latestRef.current = { ...latestRef.current, active_location_id: null };
          void upsert(null, latestRef.current.active_norad_id);
        }
        return;
      }
      if (activeLocationId && validIds.includes(activeLocationId)) return;
      const next = validIds[0] ?? null;
      if (next === activeLocationId) return;
      setActiveLocationIdState(next);
      latestRef.current = { ...latestRef.current, active_location_id: next };
      void upsert(next, latestRef.current.active_norad_id);
    },
    [activeLocationId, ready, upsert, userId]
  );

  /** Call after user_tracked_satellites load. */
  const reconcileNoradIds = useCallback(
    (validNoradIds: number[]) => {
      if (!userId || !ready) return;
      if (!validNoradIds.length) {
        if (activeNoradId !== null) {
          setActiveNoradIdState(null);
          latestRef.current = { ...latestRef.current, active_norad_id: null };
          void upsert(latestRef.current.active_location_id, null);
        }
        return;
      }
      if (activeNoradId != null && validNoradIds.includes(activeNoradId)) return;
      const next = validNoradIds[0] ?? null;
      if (next === activeNoradId) return;
      setActiveNoradIdState(next);
      latestRef.current = { ...latestRef.current, active_norad_id: next };
      void upsert(latestRef.current.active_location_id, next);
    },
    [activeNoradId, ready, upsert, userId]
  );

  // Realtime: another tab (e.g. Globe) updated selection
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`user-ui-state-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_ui_state', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { active_location_id: string | null; active_norad_id: number | null } | null;
          if (!row) return;
          setActiveLocationIdState(row.active_location_id);
          setActiveNoradIdState(row.active_norad_id);
          latestRef.current = { active_location_id: row.active_location_id, active_norad_id: row.active_norad_id };
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, supabase]);

  return {
    ready,
    activeLocationId,
    setActiveLocationId,
    activeNoradId,
    setActiveNoradId,
    reconcileLocationIds,
    reconcileNoradIds,
  };
}
