"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { AlertCircle, Monitor, Shield } from "lucide-react";

interface Device {
  deviceId: string;
  hostname: string;
  userEmail: string;
  os: string;
  lastSeen: string;
  riskScore: number;
  status: string;
}

const statusColors: Record<string, string> = {
  healthy: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
  at_risk: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  compromised: "bg-rose-500/20 text-rose-200 border-rose-500/40",
};

export default function EndpointsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("all");
  const [riskRange, setRiskRange] = useState<[number, number]>([0, 100]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      params.set("minRisk", String(riskRange[0]));
      params.set("maxRisk", String(riskRange[1]));
      const res = await fetch(`/api/endpoints?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setDevices(Array.isArray(data) ? data : []);
      setLoading(false);
    };
    load();
  }, [status, riskRange]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return devices.filter(
      (d) =>
        !term ||
        d.hostname?.toLowerCase().includes(term) ||
        d.deviceId?.toLowerCase().includes(term) ||
        d.userEmail?.toLowerCase().includes(term)
    );
  }, [devices, search]);

  return (
    <AppLayout title="Endpoints" rightRail={<></>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2">
            <Monitor className="h-4 w-4 text-emerald-300" />
            <span className="text-sm text-slate-200">Endpoint inventory</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2">
            <Shield className="h-4 w-4 text-amber-300" />
            <span className="text-sm text-slate-200">Risk coverage</span>
          </div>
        </div>

        <Card className="border-slate-800/80 bg-slate-900/60">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-slate-50">Devices</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-44">
                <Input
                  placeholder="Search hostname or user"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-slate-800 bg-slate-950/70 text-slate-100"
                />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-32 border-slate-800 bg-slate-950/70 text-slate-100">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="border-slate-800 bg-slate-900 text-slate-100">
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="healthy">Healthy</SelectItem>
                  <SelectItem value="at_risk">At Risk</SelectItem>
                  <SelectItem value="compromised">Compromised</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span>Risk</span>
                <Slider
                  defaultValue={[0, 100]}
                  value={riskRange}
                  onValueChange={(v) => setRiskRange([v[0], v[1]] as [number, number])}
                  min={0}
                  max={100}
                  step={5}
                  className="w-32"
                />
                <span className="text-slate-400">{riskRange[0]}-{riskRange[1]}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead className="text-slate-400">Hostname</TableHead>
                  <TableHead className="text-slate-400">User</TableHead>
                  <TableHead className="text-slate-400">OS</TableHead>
                  <TableHead className="text-slate-400">Risk</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-400">Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-400 py-6">
                      Loading endpoints...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6">
                      <div className="flex items-center justify-center gap-2 text-slate-400">
                        <AlertCircle className="h-4 w-4" />
                        No endpoints match these filters.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((d) => (
                    <TableRow key={d.deviceId} className="border-slate-800/80 hover:bg-slate-900/60">
                      <TableCell className="text-slate-100 font-medium">{d.hostname || d.deviceId}</TableCell>
                      <TableCell className="text-slate-200 text-sm">{d.userEmail}</TableCell>
                      <TableCell className="text-slate-300 text-sm capitalize">{d.os || "unknown"}</TableCell>
                      <TableCell className="text-slate-200 text-sm">{d.riskScore ?? 0}</TableCell>
                      <TableCell>
                        <Badge className={`border text-[11px] ${statusColors[d.status] || "bg-slate-800 text-slate-200 border-slate-700"}`}>
                          {d.status || "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs">{d.lastSeen}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
