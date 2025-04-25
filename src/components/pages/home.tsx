import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Settings,
  User,
  Zap,
  Shield,
  Database,
  Code,
  CheckCircle2,
  ArrowRight,
  Star,
  ChevronRight,
  Github,
  Loader2,
  Twitter,
  Instagram,
  X,
  Lightbulb,
  Wand2,
  LogIn,
  Palette,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../supabase/auth";
import { useEffect, useState } from "react";
import { supabase } from "../../../supabase/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";

interface Plan {
  id: string;
  object: string;
  active: boolean;
  amount: number;
  currency: string;
  interval: string;
  interval_count: number;
  product: string;
  created: number;
  livemode: boolean;
  [key: string]: any;
}

interface Testimonial {
  id: number;
  name: string;
  role: string;
  company: string;
  content: string;
  avatar: string;
}

interface Feature {
  title: string;
  description: string;
  icon: JSX.Element;
}

function HomePageV2() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen flex flex-col text-white relative bg-black">
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center z-0 opacity-40"
        style={ { backgroundImage: "url('/Pasted Graphic 4.jpg')" } }
      />
      {/* Optional: Add noise overlay if desired like reference */}
      {/* <div className="absolute inset-0 z-10 bg-[url('/noise.png')] opacity-10" /> */}

      {/* Header - Positioned over background */}
      <header className="container mx-auto px-6 py-5 flex justify-between items-center z-20 relative">
         {/* Logo/Title - Optional */}
        <div className="text-xl font-semibold tracking-tight">
          Duuna AI {/* Can be styled differently if needed */}
        </div>
        <nav>
          {user ? (
            <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-300">{user.email}</span>
                 <Button 
                   variant="outline"
                   size="sm" 
                   onClick={signOut} 
                   className="border-white/40 text-white hover:bg-white/10 backdrop-blur-sm bg-white/5 text-xs px-3 py-1.5"
                 >
                     Sign Out
                 </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
                <Button 
                  asChild 
                  variant="ghost" 
                  size="sm" 
                  className="text-gray-200 hover:bg-white/10 text-sm px-3 py-1.5"
                >
                    <Link to="/login">Login</Link>
                </Button>
                <Button 
                  asChild 
                  size="sm" 
                  className="bg-white text-black hover:bg-gray-200 text-sm px-4 py-1.5 rounded-md"
                >
                    <Link to="/signup">Sign Up</Link>
                </Button>
            </div>
          )}
        </nav>
      </header>

      {/* Main Content - Centered */}
      <main className="flex-grow flex flex-col justify-center items-center container mx-auto px-6 text-center z-20 relative">
        <h1 className="text-5xl md:text-7xl font-medium tracking-tight mb-5 font-serif leading-tight">
          Good Ideas Take Time.
        </h1>
        <p className="text-lg md:text-xl text-gray-300/80 max-w-xl mb-10">
          Explore our AI tools to generate stunning visuals instantly.
        </p>

        {/* Navigation Links/Buttons - Style Templates centered and larger */}
        <div className="flex flex-col items-center gap-6"> {/* Main container for buttons */}
            {/* Central/Main Button */}
             <Button 
               asChild 
               size="lg" // Keep size large, maybe add more padding
               variant="outline"
               className="bg-white/5 hover:bg-white/10 border-white/40 backdrop-blur-sm px-10 py-4 text-lg w-auto" // Increased padding, text size
             >
                <Link to="/templates">
                    <Palette className="mr-2 h-5 w-5" /> Style Templates
                </Link>
            </Button>

            {/* Secondary Buttons Container */}
            <div className="flex flex-col sm:flex-row gap-4"> {/* Container for the other two */}
               <Button 
                 asChild 
                 size="lg" // Keep size large, but less padding than central
                 variant="outline"
                 className="bg-white/5 hover:bg-white/10 border-white/40 backdrop-blur-sm px-8 py-3 text-base"
                >
                    <Link to="/generator">
                        <Wand2 className="mr-2 h-5 w-5" /> A/B Test Generator
                    </Link>
                </Button>
                 <Button 
                   asChild 
                   size="lg" // Keep size large, but less padding than central
                   variant="outline"
                   className="bg-white/5 hover:bg-white/10 border-white/40 backdrop-blur-sm px-8 py-3 text-base"
                 >
                    <Link to="/inspiration">
                        {/* Icon removed */} Brand Style Duplicator {/* Text updated */}
                    </Link>
                </Button>
            </div>
        </div>
      </main>

      {/* Footer - Optional */}
      <footer className="container mx-auto px-6 py-6 text-center text-gray-400/60 text-xs z-20 relative">
        © {new Date().getFullYear()} ImageGen AI.
      </footer>
    </div>
  );
}

export default function LandingPage() {
  return <HomePageV2 />;
}
