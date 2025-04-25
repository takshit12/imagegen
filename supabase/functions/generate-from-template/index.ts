import { serve } from 'https://deno.land/std@0.170.0/http/server.ts'; // Use a slightly newer std version if available/needed
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'; // Ensure this matches version used elsewhere
import { corsHeaders } from '../_shared/cors.ts'; // Assuming shared CORS headers
// --- Helper: Placeholder Replacer ---
// Simple placeholder replacement (e.g., {{placeholder}})
function replacePlaceholders(prompt, values) {
  let processedPrompt = prompt;
  for(const key in values){
    // Ensure value is a string or convert; handle null/undefined
    const valueStr = values[key] === null || values[key] === undefined ? '' : String(values[key]);
    const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g'); // Match {{ key }}
    processedPrompt = processedPrompt.replace(placeholder, valueStr);
  }
  // Remove any remaining unmatched placeholders (optional)
  processedPrompt = processedPrompt.replace(/{{\s*\w+\s*}}/g, '');
  return processedPrompt;
}
// --- Main Function Logic ---
serve(async (req)=>{
  // 1. Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // 2. Initialize Supabase Admin Client (use environment variables)
    const supabaseAdminClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    } // Pass user auth if needed for RLS checks within function
    );
    // 3. Parse Request Body
    const payload = await req.json();
    const { templateId, userInput, n = 1, size = '1024x1024' } = payload; // Default size/n if not provided
    if (!templateId || !userInput) {
      throw new Error('Missing templateId or userInput in request body.');
    }
    console.log(`Generating from template: ${templateId} with user input:`, userInput);
    // 4. Fetch Template Definition from Supabase
    const { data: template, error: templateError } = await supabaseAdminClient.from('style_templates').select('*') // Fetch all columns needed
    .eq('id', templateId).single(); // Expect only one template
    if (templateError) throw templateError;
    if (!template) throw new Error(`Template with ID ${templateId} not found.`);
    console.log("Fetched template:", template.name);
    // 5. Process Prompt: Replace placeholders in base_prompt with userInput values
    const finalPrompt = replacePlaceholders(template.base_prompt, userInput);
    console.log("Processed prompt:", finalPrompt);
    // 6. Prepare FormData for OpenAI
    const formData = new FormData();
    formData.append('prompt', finalPrompt);
    formData.append('model', 'gpt-image-1'); // Or the model suitable for /edits if different
    formData.append('n', String(n));
    formData.append('size', size);
    // formData.append('response_format', 'b64_json'); // Already default
    // 7. Fetch & Append Reference Images (if any) from Supabase Storage
    if (template.reference_image_urls && template.reference_image_urls.length > 0) {
      console.log(`Fetching ${template.reference_image_urls.length} reference images...`);

      // --- Fetch and append reference images ---
      const fetchPromises = template.reference_image_urls.map(async (url, index) => {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            console.error(`Failed to fetch reference image from ${url}: ${response.status} ${response.statusText}`);
            // Optionally throw or just skip this image
            return; // Skip this image on error
          }
          const blob = await response.blob();
          formData.append('image[]', blob, `reference_${index}.png`); // Use 'image[]' consistently
          console.log(`Appended reference image ${index + 1} from ${url}`);
        } catch (fetchError) {
          console.error(`Error fetching reference image ${index + 1} from ${url}:`, fetchError);
          // Optionally throw or just skip
        }
      });

      await Promise.all(fetchPromises); // Wait for all fetches to complete
      // --- End fetching logic ---
    }
    // 8. Append User-Uploaded Images (if any) - Identify based on userInput keys/template definition
    //    Requires agreement on how image data (base64) is passed in userInput
    //    Example: if userInput contains a 'user_logo' field with base64 data
    const imageInputKeys = template.required_inputs?.filter((input)=>input.type === 'image_upload').map((input)=>input.id) ?? [];
    for (const key of imageInputKeys){
      const base64Data = userInput[key];
      if (typeof base64Data === 'string' && base64Data.length > 10) {
        try {
          // Convert base64 to Blob
          const byteString = atob(base64Data);
          const mimeString = 'image/png'; // Or detect from base64 prefix if included
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for(let i = 0; i < byteString.length; i++){
            ia[i] = byteString.charCodeAt(i);
          }
          const blob = new Blob([
            ab
          ], {
            type: mimeString
          });
          // Append to FormData - Important: Decide if user images are 'image[]' or specific keys
          formData.append('image[]', blob, `${key}.png`); // Using 'image[]' for consistency
          console.log(`Appended user image from input key: ${key}`);
        } catch (e) {
          console.error(`Failed to decode/append base64 image for key ${key}:`, e);
        // Decide if this should be a fatal error or just a warning
        }
      }
    }
    // 9. Call OpenAI API
    const openaiUrl = 'https://api.openai.com/v1/images/edits'; // Use edits endpoint
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable.');
    }
    const response = await fetch(openaiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: formData
    });
    // 10. Handle OpenAI Response
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('OpenAI API Error:', response.status, errorBody);
      throw new Error(`OpenAI API request failed: ${response.status} ${errorBody}`);
    }
    const result = await response.json();
    // --- Expected OpenAI /edits response format ---
    // {
    //   "created": 167...,
    //   "data": [
    //     { "url": "https://..." }, // Or { "b64_json": "..." } if requested
    //     { "url": "https://..." }
    //   ]
    // }
    // Adapting to match the expected format for the frontend (array of b64_json)
    // If OpenAI returns URLs, you'd need another step to fetch those images and convert to base64.
    // Assuming response_format=b64_json was implicitly used or set:
    const images = result.data.map((img)=>img.b64_json); // Adjust if format is URL
    // 11. Return Success Response
    return new Response(JSON.stringify({
      images
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error in generate-from-template function:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
