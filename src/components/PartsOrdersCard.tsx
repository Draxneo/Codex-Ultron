/**
 * PartsOrdersCard — Shows parts/equipment orders for a job.
 * Used in JobDetail overview tab. Allows office to add orders,
 * update status, and track PO numbers + supply house locations.
 */

import { useState } from "react";
import { usePartsOrders, useCreatePartsOrder, useUpdatePartsOrder, useDeletePartsOrder } from "@/hooks/usePartsOrders";
import { useSupplyHouseLocations } from "@/hooks/useSupplyHouseLocations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Package, Plus, MapPin, Truck, CheckCircle, Clock, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  ordered: { label: "Ordered", color: "bg-amber-500/10 text-amber-700 border-amber-200", icon: Clock },
  ready_for_pickup: { label: "Ready for Pickup", color: "bg-emerald-500/10 text-emerald-700 border-emerald-200", icon: Truck },
  picked_up: { label: "Picked Up", color: "bg-primary/10 text-primary border-primary/20", icon: CheckCircle },
};

export function PartsOrdersCard({ jobId }: { jobId: string }) {
  const { data: orders = [], isLoading } = usePartsOrders(jobId);
  const { locations: supplyHouses } = useSupplyHouseLocations();
  const createOrder = useCreatePartsOrder();
  const updateOrder = useUpdatePartsOrder();
  const deleteOrder = useDeletePartsOrder();

  const [showAdd, setShowAdd] = useState(false);
  const [newOrder, setNewOrder] = useState({ supply_house_id: "", po_number: "", description: "", expected_arrival: "" });

  const handleAdd = async () => {
    if (!newOrder.description) {
      toast({ title: "Enter a description", variant: "destructive" });
      return;
    }
    await createOrder.mutateAsync({
      job_id: jobId,
      supply_house_id: newOrder.supply_house_id || undefined,
      po_number: newOrder.po_number || undefined,
      description: newOrder.description,
      expected_arrival: newOrder.expected_arrival || undefined,
    });
    toast({ title: "Parts order added" });
    setNewOrder({ supply_house_id: "", po_number: "", description: "", expected_arrival: "" });
    setShowAdd(false);
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    const updates: any = { id: orderId, jobId, status: newStatus };
    if (newStatus === "picked_up") updates.picked_up_at = new Date().toISOString();
    await updateOrder.mutateAsync(updates);
    toast({ title: `Status updated to ${STATUS_CONFIG[newStatus]?.label || newStatus}` });
  };

  if (isLoading) return null;
  if (orders.length === 0 && !showAdd) {
    return (
      <Card>
        <CardContent className="py-4">
          <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setShowAdd(true)}>
            <Package className="h-4 w-4 mr-2" /> Add Parts / Pickup Order
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2"><Package className="h-4 w-4" /> Parts & Pickup</span>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}><Plus className="h-3.5 w-3.5" /></Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {orders.map((order) => {
          const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.ordered;
          const StatusIcon = cfg.icon;
          return (
            <div key={order.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{order.description}</p>
                  {order.po_number && <p className="text-xs text-muted-foreground">PO# {order.po_number}</p>}
                  {order.supply_house && (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(order.supply_house.address || order.supply_house.name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                    >
                      <MapPin className="h-3 w-3" /> {order.supply_house.name}
                    </a>
                  )}
                  {order.expected_arrival && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Expected: {format(new Date(order.expected_arrival + "T00:00:00"), "M/d/yyyy")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className={cn("text-[10px] shrink-0", cfg.color)}>
                    <StatusIcon className="h-3 w-3 mr-1" /> {cfg.label}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteOrder.mutate({ id: order.id, jobId })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {order.status !== "picked_up" && (
                <div className="flex gap-1.5">
                  {order.status === "ordered" && (
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleStatusChange(order.id, "ready_for_pickup")}>
                      Mark Ready
                    </Button>
                  )}
                  {(order.status === "ordered" || order.status === "ready_for_pickup") && (
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleStatusChange(order.id, "picked_up")}>
                      Mark Picked Up
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Parts Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">What's being ordered?</Label>
              <Input value={newOrder.description} onChange={e => setNewOrder(p => ({ ...p, description: e.target.value }))} placeholder="e.g. 3-ton condenser, TXV valve..." />
            </div>
            <div>
              <Label className="text-sm">Supply House</Label>
              <Select value={newOrder.supply_house_id} onValueChange={v => setNewOrder(p => ({ ...p, supply_house_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select supply house..." /></SelectTrigger>
                <SelectContent>
                  {supplyHouses.map((sh: any) => (
                    <SelectItem key={sh.id} value={sh.id}>{sh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">PO Number</Label>
              <Input value={newOrder.po_number} onChange={e => setNewOrder(p => ({ ...p, po_number: e.target.value }))} placeholder="CE-44821" />
            </div>
            <div>
              <Label className="text-sm">Expected Arrival</Label>
              <Input type="date" value={newOrder.expected_arrival} onChange={e => setNewOrder(p => ({ ...p, expected_arrival: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAdd} disabled={createOrder.isPending}>
              {createOrder.isPending ? "Adding..." : "Add Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
