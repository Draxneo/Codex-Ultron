import { useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Package, Plus, UserPlus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewJobDialog } from "@/components/NewJobDialog";
import { NewEstimateDialog } from "@/components/NewEstimateDialog";
import { NewCustomerDialog } from "@/components/NewCustomerDialog";
import { useAuth } from "@/hooks/useAuth";
import { useEmployeeTabAccess } from "@/hooks/useEmployeeTabAccess";

export function NewItemDropdown() {
  const [showNewJob, setShowNewJob] = useState(false);
  const [showNewEstimate, setShowNewEstimate] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const { role } = useAuth();
  const allowedTabs = useEmployeeTabAccess();
  const canCreateJobs = role === "admin" || !allowedTabs || allowedTabs.has("jobs");

  if (!canCreateJobs) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1.5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="h-4 w-4" /> New
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setShowNewJob(true)} className="gap-2">
            <Wrench className="h-4 w-4 text-primary" /> Job
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowNewEstimate(true)} className="gap-2">
            <ClipboardList className="h-4 w-4 text-amber-500" /> Estimate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowNewCustomer(true)} className="gap-2">
            <UserPlus className="h-4 w-4 text-sky-500" /> Customer
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-2">
            <Link to="/catalog">
              <Package className="h-4 w-4 text-orange-500" /> Price Book Item
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewJobDialog open={showNewJob} onOpenChange={setShowNewJob} />
      <NewEstimateDialog open={showNewEstimate} onOpenChange={setShowNewEstimate} />
      <NewCustomerDialog open={showNewCustomer} onOpenChange={setShowNewCustomer} />
    </>
  );
}
