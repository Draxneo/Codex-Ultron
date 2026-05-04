import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider swipeDirection="right" swipeThreshold={150}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        // Detect channel from emoji in title for accent coloring
        const titleStr = typeof title === "string" ? title : "";
        const isEmail = titleStr.includes("📧");
        const isSms = titleStr.includes("📱");
        const isChat = titleStr.includes("💬");
        const isCall = titleStr.includes("📞");

        const accentColor = isEmail
          ? "bg-sky"
          : isSms
            ? "bg-success"
            : isChat
              ? "bg-primary"
              : isCall
                ? "bg-accent"
                : "bg-primary";

        return (
          <Toast key={id} {...props}>
            {/* Left accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${accentColor}`} />
            <div className="grid gap-0.5 pl-2">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
