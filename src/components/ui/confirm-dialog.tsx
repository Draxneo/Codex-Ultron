import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmOptions {
  title?: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** When true, styles the confirm button as destructive. Defaults to true for `confirmDelete`. */
  destructive?: boolean;
  /** Optional async work — keeps the dialog in a loading state until it resolves. */
  onConfirm?: () => void | Promise<void>;
}

interface InternalState extends ConfirmOptions {
  open: boolean;
  resolve?: (value: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmDelete: (entityName: string, options?: Omit<ConfirmOptions, "title" | "description"> & { description?: ReactNode }) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<InternalState>({ open: false });
  const [loading, setLoading] = useState(false);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, open: true, resolve });
    });
  }, []);

  const confirmDelete = useCallback<ConfirmContextValue["confirmDelete"]>((entityName, options = {}) => {
    return confirm({
      title: `Delete ${entityName}?`,
      description: options.description ?? "This action cannot be undone.",
      confirmText: options.confirmText ?? "Delete",
      cancelText: options.cancelText,
      destructive: options.destructive ?? true,
      onConfirm: options.onConfirm,
    });
  }, [confirm]);

  const handleClose = (result: boolean) => {
    state.resolve?.(result);
    setState({ open: false });
    setLoading(false);
  };

  const handleConfirm = async () => {
    if (state.onConfirm) {
      try {
        setLoading(true);
        await state.onConfirm();
      } catch {
        setLoading(false);
        return; // keep dialog open on error
      }
    }
    handleClose(true);
  };

  const isDestructive = state.destructive ?? false;

  return (
    <ConfirmContext.Provider value={{ confirm, confirmDelete }}>
      {children}
      <AlertDialog
        open={state.open}
        onOpenChange={(open) => {
          if (!open && !loading) handleClose(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.title ?? "Are you sure?"}</AlertDialogTitle>
            {state.description && (
              <AlertDialogDescription>{state.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>{state.cancelText ?? "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              disabled={loading}
              className={isDestructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : state.confirmText ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmDialogProvider>");
  return ctx;
}
