import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, AlertTriangle } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[hsl(var(--navy-dark))] via-[hsl(var(--navy))] to-[hsl(var(--navy-light))]">
      <div className="text-center animate-fade-in">
        <div className="rounded-full bg-white/10 p-6 mx-auto w-fit mb-6">
          <AlertTriangle className="h-12 w-12 text-accent" />
        </div>
        <h1 className="mb-2 text-6xl font-bold text-white">404</h1>
        <p className="mb-6 text-lg text-white/70">This page doesn't exist or has been moved.</p>
        <Button
          size="lg"
          className="bg-accent text-accent-foreground hover:bg-accent/90"
          onClick={() => navigate("/")}
        >
          <Home className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
