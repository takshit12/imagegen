/* eslint-disable */
// @ts-nocheck

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Helper function to safely get environment variables
function getEnvVar(key) {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Environment variable ${key} is not set.`);
  }
  return value;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }

  try {
    // Initialize Supabase Admin client
    const supabaseUrl = getEnvVar('SUPABASE_URL');
    const serviceRoleKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Extract user ID from bearer token
    const authHeader = req.headers.get('authorization') || '';
    let uid = 'anonymous';
    
    if (authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const [, payload] = token.split('.');
        const jsonPayload = JSON.parse(atob(payload));
        uid = jsonPayload.sub || jsonPayload.user_id || 'anonymous';
      } catch (e) {
        console.error("JWT parsing error:", e);
      }
    }
    
    if (uid === 'anonymous') {
      throw new Error("Authentication required. Please sign in to use this feature.");
    }

    // Parse request body
    const { 
      prompt, 
      inspirationImages = [], // b64 encoded inspiration images
      n = 1, 
      size = "1024x1024" 
    } = await req.json();

    if (!prompt) {
      throw new Error("Missing required field: prompt.");
    }

    console.log(`Submitting job for user ${uid} with ${inspirationImages.length} inspiration images`);

    // If inspirationImages provided, upload them first
    const inspPaths = [];
    
    if (inspirationImages && inspirationImages.length > 0) {
      for (let i = 0; i < inspirationImages.length; i++) {
        const base64Data = inspirationImages[i].startsWith('data:') 
          ? inspirationImages[i].split(',')[1] 
          : inspirationImages[i];
          
        if (!base64Data) {
          throw new Error(`Invalid base64 string for inspiration image ${i}.`);
        }
        
        // Upload inspiration image to storage
        const jobId = crypto.randomUUID();
        const filePath = `${uid}/inspiration/${jobId}/${i}.png`;
        const fileBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        
        const { error: uploadErr } = await supabaseAdmin.storage
          .from('generated-images')
          .upload(filePath, fileBytes, { contentType: 'image/png', upsert: true });
          
        if (uploadErr) {
          throw new Error(`Failed to upload inspiration image: ${uploadErr.message}`);
        }
        
        inspPaths.push(filePath);
      }
    }

    // Create job record
    const { data, error } = await supabaseAdmin
      .from('style_jobs')
      .insert({
        user_id: uid,
        prompt,
        insp_paths: inspPaths,
        n: Math.min(4, Math.max(1, Number(n))), // Limit to 1-4 variations 
        size,
        status: 'QUEUED'
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create job: ${error.message}`);
    }

    // Immediately trigger the worker function if desired
    // This is optional - if you have a scheduler set up, you can skip this
    try {
      fetch(`${supabaseUrl}/functions/v1/process-style-jobs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json'
        }
      }).catch(e => console.log('Background worker trigger error (non-fatal):', e));
    } catch (e) {
      // Ignore errors, the scheduler will pick it up eventually
      console.log('Background trigger failed (non-fatal):', e);
    }

    return new Response(JSON.stringify({
      job_id: data.id,
      message: "Job submitted successfully",
      status: "QUEUED"
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error) {
    console.error("Error in submit-style-job:", error);
    return new Response(JSON.stringify({
      error: error.message || "An internal server error occurred."
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
}); 