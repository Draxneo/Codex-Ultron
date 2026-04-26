/**
 * Shared icon map for workflow steps — used across StepNode, WorkflowActionBar, etc.
 * Single source of truth for step icon rendering.
 */
import {
  Calendar, User, ClipboardList, Truck, MessageSquare, FileCheck, Star,
  CheckCircle, CreditCard, FileText, MapPin, Play, Camera, Shield,
  Receipt, CalendarCheck, DollarSign, Phone, Flag, BookOpen, BarChart3,
  CalendarPlus, CheckSquare, Send, UserPlus,
} from "lucide-react";

export const WORKFLOW_ICON_MAP: Record<string, React.ReactNode> = {
  "calendar": <Calendar className="h-4 w-4" />,
  "user": <User className="h-4 w-4" />,
  "clipboard-list": <ClipboardList className="h-4 w-4" />,
  "truck": <Truck className="h-4 w-4" />,
  "message-square": <MessageSquare className="h-4 w-4" />,
  "file-check": <FileCheck className="h-4 w-4" />,
  "star": <Star className="h-4 w-4" />,
  "check-circle": <CheckCircle className="h-4 w-4" />,
  "credit-card": <CreditCard className="h-4 w-4" />,
  "file-text": <FileText className="h-4 w-4" />,
  "map-pin": <MapPin className="h-4 w-4" />,
  "play": <Play className="h-4 w-4" />,
  "camera": <Camera className="h-4 w-4" />,
  "shield": <Shield className="h-4 w-4" />,
  "receipt": <Receipt className="h-4 w-4" />,
  "calendar-check": <CalendarCheck className="h-4 w-4" />,
  "check-square": <CheckSquare className="h-4 w-4" />,
  "dollar-sign": <DollarSign className="h-4 w-4" />,
  "phone": <Phone className="h-4 w-4" />,
  "flag": <Flag className="h-4 w-4" />,
  "book-open": <BookOpen className="h-4 w-4" />,
  "file-bar-chart": <BarChart3 className="h-4 w-4" />,
  "calendar-plus": <CalendarPlus className="h-4 w-4" />,
  "send": <Send className="h-4 w-4" />,
};

/** Owner role colors for workflow step badges */
export const OWNER_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  office: { bg: "bg-blue-500/15", text: "text-blue-700", border: "border-blue-300", label: "Office" },
  tech: { bg: "bg-orange-500/15", text: "text-orange-700", border: "border-orange-300", label: "Tech" },
  customer: { bg: "bg-emerald-500/15", text: "text-emerald-700", border: "border-emerald-300", label: "Customer" },
  system: { bg: "bg-gray-500/15", text: "text-gray-600", border: "border-gray-300", label: "System" },
};
