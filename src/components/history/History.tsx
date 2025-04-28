import { useEffect, useState } from 'react';
import { supabase } from '../../../supabase/supabase';
import CreativePreview from '@/components/generator/CreativePreview';
import HistoryInfinite from "./HistoryInfinite";

interface DbRow {
  id: string;
  path: string;
  prompt: string;
  size: string;
  created_at: string;
}

export default function History() {
  return (
    <div className="h-full w-full">
      <HistoryInfinite />
    </div>
  );
} 