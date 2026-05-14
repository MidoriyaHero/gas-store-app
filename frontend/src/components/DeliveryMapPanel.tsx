import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import { toast } from "sonner";
import { MapPin, Navigation } from "lucide-react";
import type { GeocodeHit } from "@/lib/geocode-map";
import { googleDirectionsUrl, osmEmbedUrl } from "@/lib/geocode-map";

export interface DeliveryMapOrderRow {
  id: number;
  order_code: string;
  customer_name: string;
  address?: string | null;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
  delivery_status?: "in_transit" | "completed";
}

/** True when order has persisted WGS84 coordinates from admin GPS pin. */
function hasSavedGps(o: DeliveryMapOrderRow): boolean {
  const la = o.delivery_latitude;
  const lo = o.delivery_longitude;
  return la != null && lo != null && Number.isFinite(Number(la)) && Number.isFinite(Number(lo));
}

/** Match order form / API payload rounding so Maps URL aligns with saved GPS. */
function roundCoord6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Geocode / OSM preview and Google directions for delivery orders (admin list or staff in-transit).
 */
export function DeliveryMapPanel() {
  const { user } = useAuth();
  const isStaff = user?.role === "user";
  const [orders, setOrders] = useState<DeliveryMapOrderRow[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [candidates, setCandidates] = useState<GeocodeHit[]>([]);
  const [mapPoint, setMapPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [mapLabel, setMapLabel] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!user) return;
    setLoadingOrders(true);
    try {
      if (user.role === "admin") {
        const data = await apiGet<{ items: DeliveryMapOrderRow[] }>("/api/orders?limit=50&offset=0");
        setOrders(data.items ?? []);
      } else {
        const data = await apiGet<DeliveryMapOrderRow[]>("/api/me/orders?limit=50&delivery_status=in_transit");
        setOrders(data ?? []);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được đơn");
    }
    setLoadingOrders(false);
  }, [user]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const selected = selectedId != null ? orders.find((o) => o.id === selectedId) : undefined;
  const addr = (selected?.address ?? "").trim();
  const selectedGps = selected && hasSavedGps(selected);

  const openOrderOnMap = async (order: DeliveryMapOrderRow) => {
    setSelectedId(order.id);
    setMapPoint(null);
    setMapLabel(null);
    setCandidates([]);
    if (hasSavedGps(order)) {
      const la = Number(order.delivery_latitude);
      const lo = Number(order.delivery_longitude);
      setGeocodeLoading(true);
      try {
        const hit = await apiGet<GeocodeHit>(
          `/api/geocode/reverse?lat=${encodeURIComponent(String(la))}&lng=${encodeURIComponent(String(lo))}`
        );
        setMapPoint({ lat: hit.lat, lng: hit.lng });
        setMapLabel(hit.display_name);
      } catch {
        setMapPoint({ lat: la, lng: lo });
        setMapLabel(`${la}, ${lo}`);
      }
      setGeocodeLoading(false);
      return;
    }
    const a = (order.address ?? "").trim();
    if (a.length < 2) {
      toast.error("Đơn chưa có địa chỉ chữ hoặc GPS để xem bản đồ");
      setSelectedId(null);
      return;
    }
    setGeocodeLoading(true);
    try {
      const res = await apiGet<{ items: GeocodeHit[] }>(`/api/geocode?q=${encodeURIComponent(a)}&limit=6`);
      const items = res.items ?? [];
      setCandidates(items);
      if (items.length === 0) {
        toast.message("Không tìm thấy vị trí — thử sửa địa chỉ trên đơn hoặc ghim GPS trên đơn");
      } else {
        const first = items[0];
        setMapPoint({ lat: first.lat, lng: first.lng });
        setMapLabel(first.display_name);
        if (items.length > 1) toast.message("Có nhiều kết quả — chọn dòng đúng bên dưới nếu cần");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Geocode thất bại");
    }
    setGeocodeLoading(false);
  };

  const pickCandidate = (h: GeocodeHit) => {
    setMapPoint({ lat: h.lat, lng: h.lng });
    setMapLabel(h.display_name);
  };

  const withAddress = orders.filter((o) => (o.address ?? "").trim().length >= 2 || hasSavedGps(o));

  const directionsTarget = (() => {
    if (mapPoint) {
      return `${roundCoord6(mapPoint.lat)},${roundCoord6(mapPoint.lng)}`;
    }
    if (selected && hasSavedGps(selected)) {
      return `${roundCoord6(Number(selected.delivery_latitude))},${roundCoord6(Number(selected.delivery_longitude))}`;
    }
    return addr || mapLabel || "";
  })();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => void loadOrders()} disabled={loadingOrders}>
          Làm mới đơn
        </Button>
      </div>
      <Card className="p-4 shadow-card">
        <h2 className="mb-2 text-sm font-semibold">Đơn hàng &amp; địa chỉ giao</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Bấm &quot;Xem bản đồ&quot;: ưu tiên GPS đã lưu trên đơn; không thì tìm theo địa chỉ chữ (Nominatim).{" "}
          {isStaff ? (
            <>
              Chỉ hiển thị đơn <span className="font-medium text-foreground">đang giao</span>.
            </>
          ) : (
            <>Danh sách tối đa 50 đơn mới nhất (mọi trạng thái giao).</>
          )}{" "}
          Mở Google Maps để chỉ đường.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã đơn</TableHead>
              <TableHead>Khách</TableHead>
              <TableHead>Địa chỉ</TableHead>
              <TableHead className="text-right">Bản đồ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => {
              const hasAddr = (o.address ?? "").trim().length >= 2;
              const hasGps = hasSavedGps(o);
              const canMap = hasAddr || hasGps;
              const isSel = selectedId === o.id;
              return (
                <TableRow key={o.id} className={isSel ? "bg-muted/50" : undefined}>
                  <TableCell className="font-mono text-xs">{o.order_code}</TableCell>
                  <TableCell>{o.customer_name}</TableCell>
                  <TableCell className="max-w-[220px] text-xs" title={o.address ?? ""}>
                    {hasAddr ? (
                      o.address
                    ) : hasGps ? (
                      <span className="text-muted-foreground">Chỉ có GPS đã ghim</span>
                    ) : (
                      <span className="text-muted-foreground">Chưa có địa chỉ</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        type="button"
                        variant={isSel ? "default" : "outline"}
                        size="sm"
                        className="min-h-10"
                        disabled={!canMap || geocodeLoading}
                        onClick={() => void openOrderOnMap(o)}
                      >
                        <MapPin className="mr-1 h-4 w-4" aria-hidden />
                        {geocodeLoading && isSel ? "Đang tìm…" : "Xem bản đồ"}
                      </Button>
                      {canMap && (
                        <Button variant="secondary" size="sm" className="min-h-10" asChild>
                          <a
                            href={googleDirectionsUrl(
                              hasGps ? `${Number(o.delivery_latitude)},${Number(o.delivery_longitude)}` : (o.address ?? "").trim()
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Navigation className="mr-1 h-4 w-4" aria-hidden />
                            Chỉ đường
                          </a>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!loadingOrders && orders.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có đơn nào trong danh sách.</p>
        )}
      </Card>

      {selected && (
        <Card className="space-y-3 p-4 shadow-card">
          <h2 className="text-sm font-semibold">
            Đơn {selected.order_code} — {selected.customer_name}
          </h2>
          {addr && <p className="text-xs text-muted-foreground">Địa chỉ giao: {addr}</p>}
          {!addr && selectedGps && selected && (
            <p className="text-xs text-muted-foreground">
              GPS đơn: {Number(selected.delivery_latitude).toFixed(6)}, {Number(selected.delivery_longitude).toFixed(6)}
            </p>
          )}
          {candidates.length > 1 && (
            <ul className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
              {candidates.map((h) => (
                <li key={h.place_id}>
                  <button
                    type="button"
                    className={`w-full rounded px-2 py-1.5 text-left hover:bg-muted ${
                      mapPoint && mapPoint.lat === h.lat && mapPoint.lng === h.lng ? "bg-muted font-medium" : ""
                    }`}
                    onClick={() => pickCandidate(h)}
                  >
                    {h.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {mapLabel && <p className="text-xs text-muted-foreground">Đang ghim: {mapLabel}</p>}
          {mapPoint && (
            <>
              <Card className="overflow-hidden p-0 shadow-card">
                <iframe
                  title="Bản đồ OSM theo đơn"
                  className="h-[min(55vh,420px)] w-full border-0"
                  src={osmEmbedUrl(mapPoint.lat, mapPoint.lng)}
                />
              </Card>
              {directionsTarget && (
                <Button variant="secondary" className="w-full sm:w-auto" asChild>
                  <a href={googleDirectionsUrl(directionsTarget)} target="_blank" rel="noreferrer">
                    <Navigation className="mr-2 h-4 w-4" aria-hidden />
                    Google Maps chỉ đường tới điểm này
                  </a>
                </Button>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
