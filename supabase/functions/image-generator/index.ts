import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts"; // Adjust path/definition if needed
// Helper function to safely get environment variables
function getEnvVar(key) {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Environment variable ${key} is not set.`);
  }
  return value;
}
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    const apiKey = getEnvVar("OPENAI_API_KEY");
    const openaiUrl = "https://api.openai.com/v1/images/generations";
    // --- Get data from Frontend Request ---
    const { headline, description, audience, style: visualStyle, variations = 1 } = await req.json();
    // --- Basic Input Validation ---
    if (!headline || !description || !audience || !visualStyle) {
      return new Response(JSON.stringify({
        error: "Missing required fields: headline, description, audience, style."
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        },
        status: 400
      });
    }
    const n = Math.max(1, Math.min(10, Number(variations) || 1)); // Ensure n is between 1 and 10
    // --- Construct the Prompt for OpenAI ---
    // Combine form inputs into a detailed prompt for gpt-image-1
    const prompt = `Generate an ad creative image suitable for digital advertising.
    Headline: "${headline}"
    Product Description: "${description}"
    Target Audience: "${audience}"
    Desired Visual Style: "${visualStyle}"
    Format: PNG
    `;
    // --- Prepare OpenAI API Request Body ---
    const requestBody = {
      model: "gpt-image-1",
      prompt: prompt,
      n: n,
      size: "1024x1024"
    };
    console.log("Sending request to OpenAI:", JSON.stringify(requestBody, null, 2)); // Added logging
    // --- Call OpenAI API ---
    const openaiResponse = await fetch(openaiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
    // --- Handle OpenAI Response ---
    const responseBodyText = await openaiResponse.text(); // Read body text first for better error logging
    console.log("Received response status from OpenAI:", openaiResponse.status);
    // console.log("Received response body from OpenAI:", responseBodyText); // Uncomment for detailed debugging if needed
    if (!openaiResponse.ok) {
      let errorBody;
      try {
        errorBody = JSON.parse(responseBodyText); // Try to parse error JSON
        console.error("OpenAI API Error Body:", errorBody);
      } catch (e) {
        console.error("Failed to parse OpenAI error response as JSON:", responseBodyText);
        errorBody = {
          error: {
            message: responseBodyText
          }
        }; // Fallback error structure
      }
      throw new Error(`OpenAI API request failed: ${openaiResponse.status} ${openaiResponse.statusText} - ${errorBody?.error?.message || 'Unknown error details'}`);
    }
    const responseData = JSON.parse(responseBodyText); // Parse the successful response
    // Extract the base64 encoded image data
    if (!responseData.data || !Array.isArray(responseData.data) || responseData.data.length === 0 || !responseData.data[0].b64_json) {
      console.error("Invalid or empty data structure received from OpenAI:", responseData);
      throw new Error("OpenAI response did not contain valid image data.");
    }
    const imageB64List = responseData.data.map((item)=>item.b64_json);
    // --- Send Response back to Frontend ---
    return new Response(JSON.stringify({
      images: imageB64List
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 200
    });
  } catch (error) {
    console.error("Function Error:", error);
    // Log the error stack trace if available
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    return new Response(JSON.stringify({
      error: error.message || "An internal server error occurred."
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 500
    });
  }
}); // Note: If you don't have a shared `cors.ts` file, define corsHeaders directly:
 // const corsHeaders = {
 //   'Access-Control-Allow-Origin': '*', // Or specific origin like 'http://localhost:5173'
 //   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 // };
