
"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, RotateCcw, Check } from "lucide-react"; 
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export interface ActivityFilters {
  dateFrom?: Date;
  dateTo?: Date;
  agentName?: string;
  module?: string;
  product?: string | "All";
}

interface FiltersProps {
  onFilterChange: (filters: ActivityFilters) => void;
  availableModules: string[];
  availableProducts: string[];
}

export function ActivityDashboardFilters({ onFilterChange, availableModules, availableProducts }: FiltersProps) {
  const [draftFilters, setDraftFilters] = useState<ActivityFilters>({ product: "All" });

  const handleApplyFilters = () => {
    onFilterChange(draftFilters);
  };

  const handleResetFilters = () => {
    const resetState: ActivityFilters = { product: "All" };
    setDraftFilters(resetState);
    onFilterChange(resetState); 
  };

  return (
    <Card className="shadow-xs">
      <CardHeader className="py-4 px-4 md:px-6">
        <CardTitle className="text-md md:text-lg">Filter Activities</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 py-3 px-4 md:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label htmlFor="dateFrom" className="text-xs">Date From</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal h-9 text-xs",
                    !draftFilters.dateFrom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {draftFilters.dateFrom ? format(draftFilters.dateFrom, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={draftFilters.dateFrom}
                  onSelect={(date) => setDraftFilters(prev => ({ ...prev, dateFrom: date || undefined }))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label htmlFor="dateTo" className="text-xs">Date To</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal h-9 text-xs",
                    !draftFilters.dateTo && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {draftFilters.dateTo ? format(draftFilters.dateTo, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={draftFilters.dateTo}
                  onSelect={(date) => setDraftFilters(prev => ({ ...prev, dateTo: date || undefined }))}
                  disabled={(date) => draftFilters.dateFrom ? date < draftFilters.dateFrom : false }
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label htmlFor="agentName" className="text-xs">Agent Name</Label>
            <Input
              id="agentName"
              placeholder="Filter by agent name"
              value={draftFilters.agentName || ""}
              onChange={(e) => setDraftFilters(prev => ({ ...prev, agentName: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>
          
          <div className="space-y-1">
            <Label htmlFor="module" className="text-xs">Module</Label>
            <Select
              value={draftFilters.module || ""}
              onValueChange={(value) => setDraftFilters(prev => ({ ...prev, module: value === "All" ? undefined : value }))}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Filter by module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Modules</SelectItem>
                {availableModules.map(mod => (
                  <SelectItem key={mod} value={mod}>{mod}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="product" className="text-xs">Product</Label>
            <Select
              value={draftFilters.product || "All"}
              onValueChange={(value) => setDraftFilters(prev => ({ ...prev, product: value }))}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Filter by product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Products</SelectItem>
                {availableProducts.map(prod => (
                  <SelectItem key={prod} value={prod}>{prod}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
        </div>
        <div className="flex justify-end space-x-2 pt-2">
            <Button onClick={handleResetFilters} variant="outline" size="sm">
                <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset Filters
            </Button>
            <Button onClick={handleApplyFilters} size="sm">
                <Check className="mr-2 h-3.5 w-3.5" /> Apply Filters
            </Button>
        </div>
      </CardContent>
    </Card>
  );
}
