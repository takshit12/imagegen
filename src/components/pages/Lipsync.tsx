import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../supabase/supabase'; // Adjust path to your Supabase client export
import { useToast } from '@/components/ui/use-toast'; // Assuming you use Shadcn UI toast
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'; // Example card usage
import { Loader2, UploadCloud, Video, Music, AlertCircle, CheckCircle } from 'lucide-react'; // Example icons
import { RealtimeChannel } from '@supabase/supabase-js';

// Define the structure matching your DB table (or relevant fields)
interface LipsyncJob {
  id: string;
  user_id: string;
  fal_request_id: string | null;
  status: string; // PENDING, UPLOADING, PROCESSING, COMPLETED, FAILED
  input_video_url: string;
  input_audio_url: string;
  output_video_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export default function LipsyncPage() { // Renamed component slightly for clarity as a page
  const { toast } = useToast();

  // State for file inputs
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  // State for tracking the job process
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false); // When calling the submit function
  const [isProcessing, setIsProcessing] = useState<boolean>(false); // After submit, waiting for completion
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null); // Display status text

  // State for results or errors
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs for file inputs to allow clearing them
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // --- File Handling Logic with Validation ---
  const MAX_FILE_SIZE_MB = 500; // Set your desired max size in MB
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setVideoFile(null); // Clear previous file first

    if (!file) {
       if(videoInputRef.current) videoInputRef.current.value = ""; // Clear input visually
       return; // No file selected
    }

    // Validate Type
    if (!file.type.startsWith('video/')) {
      toast({
        title: "Invalid Video File",
        description: "Please upload a valid video file.",
        variant: "destructive",
      });
      if(videoInputRef.current) videoInputRef.current.value = ""; // Clear input visually
      return;
    }

    // Validate Size
    if (file.size > MAX_FILE_SIZE_BYTES) {
       toast({
        title: "Video File Too Large",
        description: `Maximum file size is ${MAX_FILE_SIZE_MB}MB.`,
        variant: "destructive",
      });
       if(videoInputRef.current) videoInputRef.current.value = ""; // Clear input visually
       return;
    }

    // If valid
    setVideoFile(file);
    console.log("Valid video file selected:", file.name);
  };

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setAudioFile(null); // Clear previous file first

    if (!file) {
        if(audioInputRef.current) audioInputRef.current.value = ""; // Clear input visually
        return; // No file selected
    }

    // Validate Type
     if (!file.type.startsWith('audio/')) {
      toast({
        title: "Invalid Audio File",
        description: "Please upload a valid audio file.",
        variant: "destructive",
      });
       if(audioInputRef.current) audioInputRef.current.value = ""; // Clear input visually
       return;
    }

    // Validate Size
    if (file.size > MAX_FILE_SIZE_BYTES) {
       toast({
        title: "Audio File Too Large",
        description: `Maximum file size is ${MAX_FILE_SIZE_MB}MB.`,
        variant: "destructive",
      });
       if(audioInputRef.current) audioInputRef.current.value = ""; // Clear input visually
       return;
    }

    // If valid
    setAudioFile(file);
    console.log("Valid audio file selected:", file.name);
  };

  // --- Submit Logic --- 
  const handleSubmit = async () => {
    // 1. Final Validation
    if (!videoFile || !audioFile) {
      toast({
        title: "Files Missing",
        description: "Please select both a video and an audio file.",
        variant: "destructive",
      });
      return;
    }

    // 2. Set submitting state and clear errors
    setIsSubmitting(true);
    setErrorMessage(null);
    setOutputUrl(null);
    setCurrentJobId(null);
    setJobStatus(null);

    // 3. Create FormData
    const formData = new FormData();
    formData.append('videoFile', videoFile); // Key must match Edge Function expectation
    formData.append('audioFile', audioFile); // Key must match Edge Function expectation

    console.log("Submitting files to Edge Function...");

    // 4. Invoke the Edge Function
    try {
      const { data, error } = await supabase.functions.invoke('submit-lipsync-job', {
        body: formData,
        // Note: Supabase client automatically includes Authorization header if user is logged in
      });

      if (error) {
        // Handle errors thrown by the function itself (network, permissions, etc.)
        console.error("Edge function invocation error:", error);
        throw new Error(`Function Error: ${error.message}`);
      }

      // Check the success flag and data returned from our function logic
      if (data?.success && data.jobId) {
         console.log("Job submission successful. Job ID:", data.jobId);
        toast({
          title: "Job Submitted",
          description: "Your files are being processed. Status updates will appear below.",
        });
        // Set state for processing
        setCurrentJobId(data.jobId);
        setIsProcessing(true);
        setJobStatus('PROCESSING'); // Assume this initial status

        // Clear file inputs and state
        setVideoFile(null);
        setAudioFile(null);
        if (videoInputRef.current) videoInputRef.current.value = "";
        if (audioInputRef.current) audioInputRef.current.value = "";
      } else {
        // Handle errors returned explicitly by our function's logic
         console.error("Job submission failed on server:", data?.error);
        throw new Error(data?.error || 'Failed to submit job. Please try again.');
      }
    } catch (err: any) {
      // Catch any other errors (network, parsing, thrown errors)
      console.error("HandleSubmit Error:", err);
      setErrorMessage(err.message || 'An unexpected error occurred during submission.');
      toast({ title: 'Submission Error', description: err.message, variant: 'destructive' });
      // Ensure processing state is false if submission fails
      setIsProcessing(false);
      setCurrentJobId(null);
      setJobStatus(null);
    } finally {
      // 5. Always reset submitting state
      setIsSubmitting(false);
    }
  };

  // --- Realtime Logic --- 
  useEffect(() => {
    // Don't subscribe if there's no active job ID
    if (!currentJobId) {
      return;
    }

    console.log(`Setting up Realtime subscription for job: ${currentJobId}`);
    setErrorMessage(null); // Clear previous errors when starting to listen

    // Define the channel variable here so cleanup can access it
    let channel: RealtimeChannel | null = null;

    // Create a function to handle payload processing
    const handlePayload = (payload: any) => {
      console.log('Realtime Payload received:', payload);
      const updatedJob = payload.new as LipsyncJob;

      if (updatedJob && updatedJob.id === currentJobId) { // Double check ID match
        setJobStatus(updatedJob.status); // Always update status display

        if (updatedJob.status === 'COMPLETED') {
          console.log(`Job ${currentJobId} completed. Output URL:`, updatedJob.output_video_url);
          setOutputUrl(updatedJob.output_video_url);
          setErrorMessage(null);
          setIsProcessing(false);
          toast({ title: 'Processing Complete!', description: 'Your lipsynced video is ready.'});
          // Unsubscribe after completion? Optional, but good practice if no more updates expected
          // if (channel) supabase.removeChannel(channel);
        } else if (updatedJob.status === 'FAILED') {
           console.error(`Job ${currentJobId} failed. Error:`, updatedJob.error_message);
          setErrorMessage(updatedJob.error_message || 'An unknown error occurred during processing.');
          setOutputUrl(null);
          setIsProcessing(false);
           toast({ title: 'Job Failed', description: updatedJob.error_message || 'Please try again.', variant: 'destructive' });
          // Unsubscribe after failure? Optional.
          // if (channel) supabase.removeChannel(channel);
        } else {
           // Still processing (e.g., status updated from UPLOADING to PROCESSING)
           // Keep isProcessing = true
           setIsProcessing(true);
        }
      } else {
         console.warn("Received payload for irrelevant job ID:", payload);
      }
    };

    channel = supabase.channel(`lipsync_job_${currentJobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'lipsync_jobs',
          filter: `id=eq.${currentJobId}` // Filter for the specific job ID
        },
        handlePayload // Call the handler function
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Realtime channel subscribed for job ${currentJobId}`);
          // Optional: Fetch current status in case webhook beat the subscription
          // async function fetchInitialStatus() { ... }
          // fetchInitialStatus();
        } else {
          console.error(`Realtime subscription failed for job ${currentJobId}. Status: ${status}`, err);
          setErrorMessage('Could not connect for live updates. Please check back later or refresh.');
          setIsProcessing(false); // Stop processing indicator if subscription fails
          toast({ title: 'Realtime Error', description: 'Failed to get live status updates.', variant: 'destructive' });
        }
      });

    // --- Cleanup function --- 
    // This runs when the component unmounts or currentJobId changes
    return () => {
      if (channel) {
        console.log(`Unsubscribing from Realtime channel for job: ${currentJobId}`);
        supabase.removeChannel(channel).catch(err => {
             console.error("Error removing Realtime channel:", err);
        });
      }
    };
  }, [currentJobId, toast]); // Dependency array includes currentJobId and toast

  // --- Reset State ---
  const resetState = () => {
      setVideoFile(null);
      setAudioFile(null);
      setIsSubmitting(false);
      setIsProcessing(false);
      setCurrentJobId(null);
      setJobStatus(null);
      setOutputUrl(null);
      setErrorMessage(null);
      if(videoInputRef.current) videoInputRef.current.value = "";
      if(audioInputRef.current) audioInputRef.current.value = "";
  }

  // --- Component Return (UI Structure - very basic for now) ---
  // Added a wrapper div for potential page styling
   return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-gray-200 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg bg-white/5 backdrop-blur-xl border border-white/10 shadow-xl rounded-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-white font-semibold">Create Lipsync Video</CardTitle>
            <CardDescription className="text-gray-400">Upload a video and audio file (max 1 min each).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Input Section */}
            {!isProcessing && !outputUrl && !errorMessage && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="video-upload" className="text-sm font-medium text-gray-300 flex items-center gap-2 mb-1 cursor-pointer hover:text-white">
                      <Video className="w-4 h-4" /> Video File
                  </Label>
                  <Input
                    id="video-upload"
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleVideoFileChange}
                    disabled={isSubmitting}
                    className="bg-black/20 border border-white/10 placeholder-gray-500 focus-visible:ring-1 focus-visible:ring-indigo-500 text-white rounded-md file:bg-indigo-600/80 file:text-white file:border-0 file:rounded file:px-3 file:py-1.5 file:mr-3 file:cursor-pointer hover:file:bg-indigo-700 cursor-pointer text-sm"
                  />
                  {videoFile && <p className="text-xs text-gray-400 mt-1">Selected: {videoFile.name}</p>}
                </div>

                <div>
                  <Label htmlFor="audio-upload" className="text-sm font-medium text-gray-300 flex items-center gap-2 mb-1 cursor-pointer hover:text-white">
                      <Music className="w-4 h-4" /> Audio File
                  </Label>
                  <Input
                    id="audio-upload"
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleAudioFileChange}
                    disabled={isSubmitting}
                    className="bg-black/20 border border-white/10 placeholder-gray-500 focus-visible:ring-1 focus-visible:ring-indigo-500 text-white rounded-md file:bg-indigo-600/80 file:text-white file:border-0 file:rounded file:px-3 file:py-1.5 file:mr-3 file:cursor-pointer hover:file:bg-indigo-700 cursor-pointer text-sm"
                   />
                  {audioFile && <p className="text-xs text-gray-400 mt-1">Selected: {audioFile.name}</p>}
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={!videoFile || !audioFile || isSubmitting}
                  className="w-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:bg-gray-600 font-semibold text-base rounded-lg shadow-lg transition-all duration-300 py-2.5"
                >
                  {isSubmitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                  ) : (
                    <><UploadCloud className="mr-2 h-4 w-4" /> Upload & Generate</>
                  )}
                </Button>
              </div>
            )}

            {/* Processing State */}
            {isProcessing && (
              <div className="text-center p-6 bg-black/30 rounded-lg border border-white/10">
                <Loader2 className="h-8 w-8 text-indigo-400 animate-spin mx-auto mb-3" />
                <p className="text-lg font-medium text-white">Processing...</p>
                <p className="text-sm text-gray-400">Status: {jobStatus || 'Starting...'}</p>
                <p className="text-xs text-gray-500 mt-2">This may take a few minutes. Feel free to wait, or check back later.</p>
              </div>
            )}

            {/* Error State */}
            {errorMessage && !isProcessing && (
              <div className="text-center p-6 bg-red-900/30 rounded-lg border border-red-700/50">
                 <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
                <p className="text-lg font-medium text-red-300">Job Failed</p>
                <p className="text-sm text-red-400 break-words mt-1">{errorMessage}</p>
                 <Button variant="outline" size="sm" onClick={resetState} className="mt-5 text-white bg-white/10 hover:bg-white/20 border-0 px-4 py-1.5 rounded">
                   Try Again
                </Button>
              </div>
            )}

            {/* Success State */}
            {outputUrl && !isProcessing && !errorMessage && (
               <div className="text-center p-6 bg-green-900/30 rounded-lg border border-green-700/50">
                 <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-3" />
                <p className="text-lg font-medium text-green-300">Lipsync Complete!</p>
                <div className="mt-4 aspect-video bg-black rounded-md overflow-hidden border border-white/10">
                   <video src={outputUrl} controls className="w-full h-full" />
                </div>
                 <Button variant="outline" size="sm" onClick={resetState} className="mt-5 text-white bg-white/10 hover:bg-white/20 border-0 px-4 py-1.5 rounded">
                    Create Another
                </Button>
              </div>
            )}

          </CardContent>
        </Card>
    </div>
  );
} 