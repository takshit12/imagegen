import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../supabase/supabase'; // Adjust path
import { useAuth } from '../../../supabase/auth'; // Import useAuth to get user ID
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, UploadCloud, Video, Music, AlertCircle, CheckCircle, History, RefreshCw, Film } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from 'date-fns'; // For relative dates
import { RealtimeChannel } from '@supabase/supabase-js'; // <-- Import RealtimeChannel

// Define the structure matching your DB table
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

export default function LipsyncPage() {
  const { toast } = useToast();
  const { user } = useAuth(); // Get the logged-in user

  // State for file inputs
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  // State for tracking the current job process
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);

  // State for results or errors of the current job
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // State for past jobs history
  const [pastJobs, setPastJobs] = useState<LipsyncJob[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Refs for file inputs
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // --- Validation Constants ---
  const MAX_FILE_SIZE_MB = 500; // Adjusted max size
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  // --- File Handling Logic with Validation ---
  const handleFileChange = (
      e: React.ChangeEvent<HTMLInputElement>,
      setFile: React.Dispatch<React.SetStateAction<File | null>>,
      fileType: 'video' | 'audio'
  ) => {
    const file = e.target.files?.[0];
    setFile(null); // Clear previous file
    const inputRef = fileType === 'video' ? videoInputRef : audioInputRef;

    if (!file) {
        if(inputRef.current) inputRef.current.value = "";
        return;
    }

    const expectedPrefix = fileType === 'video' ? 'video/' : 'audio/';
    if (!file.type.startsWith(expectedPrefix)) {
      toast({
        title: `Invalid ${fileType === 'video' ? 'Video' : 'Audio'} File`,
        description: `Please upload a valid ${fileType} file.`,
        variant: "destructive",
      });
      if(inputRef.current) inputRef.current.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
       toast({
        title: `${fileType === 'video' ? 'Video' : 'Audio'} File Too Large`,
        description: `Maximum file size is ${MAX_FILE_SIZE_MB}MB.`,
        variant: "destructive",
      });
       if(inputRef.current) inputRef.current.value = "";
       return;
    }

    setFile(file);
    console.log(`Valid ${fileType} file selected:`, file.name);
  };

  // --- Submit Logic ---
  const handleSubmit = async () => {
    if (!videoFile || !audioFile) {
      toast({ title: "Files Missing", description: "Please select both files.", variant: "destructive" });
      return;
    }
    if (!user) { // Ensure user is available
      toast({ title: "Authentication Error", description: "Please log in again.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setOutputUrl(null);
    setCurrentJobId(null);
    setJobStatus(null);
    setIsProcessing(false); // Reset processing state initially

    const formData = new FormData();
    formData.append('videoFile', videoFile);
    formData.append('audioFile', audioFile);

    console.log("Submitting files to Edge Function...");

    try {
      const { data, error } = await supabase.functions.invoke('submit-lipsync-job', { body: formData });

      if (error) throw new Error(`Function Error: ${error.message}`);

      if (data?.success && data.jobId) {
         console.log("Job submission successful. Job ID:", data.jobId);
        toast({ title: "Job Submitted", description: "Processing started. Status updates below." });
        setCurrentJobId(data.jobId);
        setIsProcessing(true);
        setJobStatus('PROCESSING');
        setVideoFile(null);
        setAudioFile(null);
        if (videoInputRef.current) videoInputRef.current.value = "";
        if (audioInputRef.current) audioInputRef.current.value = "";
        fetchHistory(); // Refresh history after submission
      } else {
         console.error("Job submission failed on server:", data?.error);
        throw new Error(data?.error || 'Failed to submit job. Please try again.');
      }
    } catch (err: any) {
      console.error("HandleSubmit Error:", err);
      setErrorMessage(err.message || 'An unexpected error occurred during submission.');
      toast({ title: 'Submission Error', description: err.message, variant: 'destructive' });
      setIsProcessing(false);
      setCurrentJobId(null);
      setJobStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Fetch History Logic ---
  const fetchHistory = async () => {
    if (!user) return; // Don't fetch if user isn't loaded

    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const { data, error } = await supabase
        .from('lipsync_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20); // Limit the number of results initially

      if (error) throw error;

      setPastJobs(data || []);
    } catch (err: any) {
      console.error("Error fetching history:", err);
      setHistoryError("Failed to load past generations.");
      toast({ title: 'History Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Fetch history on initial mount
  useEffect(() => {
    if (user) { // Fetch only when user is available
        fetchHistory();
    }
  }, [user]); // Re-fetch if user changes (login/logout)

  // --- Realtime Logic for Current Job ---
  useEffect(() => {
    if (!currentJobId) return;

    console.log(`Setting up Realtime subscription for job: ${currentJobId}`);
    setErrorMessage(null);

    let channel: RealtimeChannel | null = null;

    const handlePayload = (payload: any) => {
      console.log('Realtime Payload received:', payload);
      const updatedJob = payload.new as LipsyncJob;

      if (updatedJob && updatedJob.id === currentJobId) {
        setJobStatus(updatedJob.status);

        if (updatedJob.status === 'COMPLETED') {
          console.log(`Job ${currentJobId} completed. Output URL:`, updatedJob.output_video_url);
          setOutputUrl(updatedJob.output_video_url);
          setErrorMessage(null);
          setIsProcessing(false);
          toast({ title: 'Processing Complete!', description: 'Your lipsynced video is ready.'});
          fetchHistory(); // Refresh history list
          // Optional: Unsubscribe after completion
          // if (channel) supabase.removeChannel(channel).catch(console.error);
        } else if (updatedJob.status === 'FAILED') {
           console.error(`Job ${currentJobId} failed. Error:`, updatedJob.error_message);
          setErrorMessage(updatedJob.error_message || 'An unknown error occurred during processing.');
          setOutputUrl(null);
          setIsProcessing(false);
           toast({ title: 'Job Failed', description: updatedJob.error_message || 'Please try again.', variant: 'destructive' });
           fetchHistory(); // Refresh history list
          // Optional: Unsubscribe after failure
          // if (channel) supabase.removeChannel(channel).catch(console.error);
        } else {
           setIsProcessing(true); // Still processing
        }
      } else {
         console.warn("Received payload for irrelevant job ID:", payload);
      }
    };

    channel = supabase.channel(`lipsync_job_${currentJobId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lipsync_jobs', filter: `id=eq.${currentJobId}` }, handlePayload)
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Realtime channel subscribed for job ${currentJobId}`);
        } else {
          console.error(`Realtime subscription failed for job ${currentJobId}. Status: ${status}`, err);
          setErrorMessage('Could not connect for live updates. Please check back later or refresh.');
          setIsProcessing(false);
          toast({ title: 'Realtime Error', description: 'Failed to get live status updates.', variant: 'destructive' });
        }
      });

    // Cleanup function
    return () => {
      if (channel) {
        console.log(`Unsubscribing from Realtime channel for job: ${currentJobId}`);
        supabase.removeChannel(channel).catch(err => console.error("Error removing Realtime channel:", err));
      }
    };
  }, [currentJobId, toast]); // Dependency: currentJobId

  // --- Reset State --- 
  const resetInterface = () => { // Renamed for clarity
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
      // Do not automatically fetch history here, let user click refresh if needed
  }

  // --- Helper to render status badge ---
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <Badge variant="outline" className="border-green-600/70 bg-green-900/30 text-green-300">Completed</Badge>;
      case 'PROCESSING': return <Badge variant="secondary"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Processing</Badge>;
      case 'UPLOADING': return <Badge variant="outline">Uploading</Badge>; // Or treat as processing
      case 'PENDING': return <Badge variant="outline">Pending</Badge>;
      case 'FAILED': return <Badge variant="destructive">Failed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  // --- Component Return (New Layout) ---
   return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-gray-200 p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <h1 className="text-3xl md:text-4xl text-white font-semibold text-center mb-8">Create Lipsync Video</h1>

            {/* Main Content: Two Columns */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Inputs */}
                <div className="lg:col-span-1">
                    <Card className="bg-white/5 backdrop-blur-xl border border-white/10 shadow-xl rounded-lg sticky top-8"> {/* Make card sticky */} 
                        <CardHeader>
                            <CardTitle className="text-xl text-white">Upload Files</CardTitle>
                            <CardDescription className="text-gray-400">Provide video and audio (max {MAX_FILE_SIZE_MB}MB, 1 min).</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                             <div>
                                <Label htmlFor="video-upload" className="text-sm font-medium text-gray-300 flex items-center gap-2 mb-1 cursor-pointer hover:text-white">
                                    <Video className="w-4 h-4" /> Video File
                                </Label>
                                <Input
                                    id="video-upload"
                                    ref={videoInputRef}
                                    type="file"
                                    accept="video/*"
                                    onChange={(e) => handleFileChange(e, setVideoFile, 'video')}
                                    disabled={isSubmitting || isProcessing}
                                    className="bg-black/20 border border-white/10 placeholder-gray-500 focus-visible:ring-1 focus-visible:ring-indigo-500 text-white rounded-md file:bg-indigo-600/80 file:text-white file:border-0 file:rounded file:px-3 file:py-1.5 file:mr-3 file:cursor-pointer hover:file:bg-indigo-700 cursor-pointer text-sm"
                                />
                                {videoFile && <p className="text-xs text-gray-400 mt-1 truncate">Selected: {videoFile.name}</p>}
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
                                    onChange={(e) => handleFileChange(e, setAudioFile, 'audio')}
                                    disabled={isSubmitting || isProcessing}
                                    className="bg-black/20 border border-white/10 placeholder-gray-500 focus-visible:ring-1 focus-visible:ring-indigo-500 text-white rounded-md file:bg-indigo-600/80 file:text-white file:border-0 file:rounded file:px-3 file:py-1.5 file:mr-3 file:cursor-pointer hover:file:bg-indigo-700 cursor-pointer text-sm"
                                />
                                {audioFile && <p className="text-xs text-gray-400 mt-1 truncate">Selected: {audioFile.name}</p>}
                            </div>

                            <Button
                                onClick={handleSubmit}
                                disabled={!videoFile || !audioFile || isSubmitting || isProcessing}
                                className="w-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:bg-gray-600 font-semibold text-base rounded-lg shadow-lg transition-all duration-300 py-2.5 mt-4"
                            >
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
                                 isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : // Also show loader if processing
                                 <UploadCloud className="mr-2 h-4 w-4" />}
                                {isSubmitting ? 'Submitting...' : isProcessing ? 'Processing...' : 'Upload & Generate'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                 {/* Right Column: Output/Status */}
                <div className="lg:col-span-2">
                     <Card className="bg-white/5 backdrop-blur-xl border border-white/10 shadow-xl rounded-lg min-h-[300px] flex items-center justify-center"> {/* Set min height */} 
                        <CardContent className="p-6 w-full">
                           {/* Processing State */} 
                            {isProcessing && (
                                <div className="text-center">
                                    <Loader2 className="h-12 w-12 text-indigo-400 animate-spin mx-auto mb-4" />
                                    <p className="text-xl font-medium text-white">Processing...</p>
                                    <p className="text-md text-gray-400 mt-1">Status: {jobStatus || 'Starting...'}</p>
                                    <p className="text-sm text-gray-500 mt-3">This can take several minutes.</p>
                                </div>
                            )}

                            {/* Error State */} 
                            {errorMessage && !isProcessing && (
                                <div className="text-center">
                                    <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                                    <p className="text-xl font-medium text-red-300">Job Failed</p>
                                    <p className="text-md text-red-400 break-words mt-2 max-w-md mx-auto">{errorMessage}</p>
                                    <Button variant="outline" size="sm" onClick={resetInterface} className="mt-6 text-white bg-white/10 hover:bg-white/20 border-0 px-5 py-2 rounded">
                                       Try Again
                                    </Button>
                                </div>
                            )}

                             {/* Success State */} 
                            {outputUrl && !isProcessing && !errorMessage && (
                                <div className="text-center">
                                     <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                                    <p className="text-xl font-medium text-green-300">Lipsync Complete!</p>
                                    <div className="mt-5 aspect-video bg-black rounded-md overflow-hidden border border-white/10 max-w-xl mx-auto">
                                       <video src={outputUrl} controls className="w-full h-full" />
                                    </div>
                                    <Button variant="outline" size="sm" onClick={resetInterface} className="mt-6 text-white bg-white/10 hover:bg-white/20 border-0 px-5 py-2 rounded">
                                        Create Another
                                    </Button>
                                </div>
                            )}

                             {/* Initial Placeholder State */} 
                            {!isProcessing && !outputUrl && !errorMessage && (
                                <div className="text-center text-gray-500">
                                    <Video className="h-16 w-16 mx-auto mb-4 opacity-30"/>
                                    <p className="text-lg">Your generated video will appear here.</p>
                                    <p className="text-sm">Upload video and audio files on the left.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* History Section */}
            <div className="mt-12">
                <Card className="bg-white/5 backdrop-blur-xl border border-white/10 shadow-xl rounded-lg">
                    <CardHeader className="flex flex-row items-center justify-between pb-4">
                        <div>
                            <CardTitle className="text-xl text-white flex items-center gap-2">
                                <History className="w-5 h-5"/> Generation History
                            </CardTitle>
                            <CardDescription className="text-gray-400">Your past 20 lipsync jobs.</CardDescription>
                        </div>
                        <Button variant="outline" size="icon" onClick={fetchHistory} disabled={isLoadingHistory} className="text-gray-300 bg-white/5 hover:bg-white/10 border-0">
                             <RefreshCw className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[400px] pr-3"> {/* Set fixed height for scroll */} 
                            {isLoadingHistory ? (
                                <div className="flex justify-center items-center h-full">
                                    <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                                </div>
                            ) : historyError ? (
                                <div className="flex justify-center items-center h-full text-red-400">
                                    <AlertCircle className="mr-2 w-5 h-5" /> {historyError}
                                </div>
                            ) : pastJobs.length === 0 ? (
                                 <div className="flex justify-center items-center h-full text-gray-500">
                                    No past jobs found.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {pastJobs.map((job) => (
                                        <div key={job.id} className="flex items-center justify-between p-3 bg-black/20 rounded-md border border-white/10">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                {/* Placeholder/Icon */} 
                                                <div className="flex-shrink-0 w-10 h-10 bg-indigo-900/50 rounded flex items-center justify-center">
                                                    <Film className="w-5 h-5 text-indigo-300"/>
                                                </div>
                                                 <div className="overflow-hidden">
                                                    <p className="text-sm font-medium text-white truncate">Job ID: ...{job.id.slice(-6)}</p>
                                                    <p className="text-xs text-gray-400">
                                                         {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                                                {renderStatusBadge(job.status)}
                                                {job.status === 'COMPLETED' && job.output_video_url && (
                                                    <a href={job.output_video_url} target="_blank" rel="noopener noreferrer">
                                                        <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200">
                                                            View
                                                        </Button>
                                                    </a>
                                                )}
                                                {/* Optionally add retry/delete buttons */} 
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    </div>
  );
} 