import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

function useLandingRealtime() {
  const queryClient = useQueryClient();
  useRealtimeInvalidation({
    channel: "landing-content-live",
    tables: ["categories", "testimonials", "faqs", "preorders"],
    queryKeys: [["landing"]],
    queryClient,
  });
}

export function useLandingCategories() {
  useLandingRealtime();
  return useQuery({
    queryKey: ["landing", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60,
  });
}

export function useLandingTestimonials() {
  useLandingRealtime();
  return useQuery({
    queryKey: ["landing", "testimonials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("testimonials")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60,
  });
}

export function useLandingFAQs() {
  useLandingRealtime();
  return useQuery({
    queryKey: ["landing", "faqs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faqs")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60,
  });
}

export function useLandingStats() {
  useLandingRealtime();
  return useQuery({
    queryKey: ["landing", "stats"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return { totalUsers: count ?? 0 };
    },
    staleTime: 1000 * 60,
  });
}

export function useCategoryCounts() {
  useLandingRealtime();
  return useQuery({
    queryKey: ["landing", "category-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("preorders")
        .select("name, quota_taken")
        .eq("active", true);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60,
  });
}
