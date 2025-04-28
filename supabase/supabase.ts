import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// Configure for large payload handling
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input, init) => {
      // Increase timeout to 10 minutes (600,000 ms)
      const timeout = 600000;
      const controller = new AbortController();
      const signal = controller.signal;
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      // Set these options to better handle large responses
      const fetchOptions = {
        ...init,
        signal,
        // Disable response size limits if present in Node.js environments
        highWaterMark: 100 * 1024 * 1024, // 100MB buffer for streams
      };

      return fetch(input, fetchOptions)
        .then(response => {
          clearTimeout(timeoutId);
          return response;
        })
        .catch(error => {
          clearTimeout(timeoutId);
          throw error;
        });
    },
  },
  // Increase buffer size for large responses
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
