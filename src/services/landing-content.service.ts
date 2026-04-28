import { supabase } from '@/lib/supabase'
import type { Category, Testimonial, FAQ } from '@/types/database.types'

export const categoriesService = {
  async list(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('active', true)
      .order('sort_order')
    if (error) throw error
    return data
  },
}

export const testimonialsService = {
  async list(): Promise<Testimonial[]> {
    const { data, error } = await supabase
      .from('testimonials')
      .select('*')
      .eq('active', true)
      .order('sort_order')
    if (error) throw error
    return data
  },
}

export const faqsService = {
  async list(): Promise<FAQ[]> {
    const { data, error } = await supabase
      .from('faqs')
      .select('*')
      .eq('active', true)
      .order('sort_order')
    if (error) throw error
    return data
  },
}
