"use client";

import { useState, useMemo, useEffect } from 'react';
import { useActivityLogger } from '@/hooks/use-activity-logger';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogDesc, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from '@/components/ui/skeleton';
import { CombinedCallAnalysisResultsCard } from '@/components/features/combined-call-analysis/combined-call-analysis-results-card';
import { exportToCsv, exportTableDataToPdf, exportTableDataForDoc } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { Eye, List, FileSpreadsheet, FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActivityLogEntry, CombinedCallAnalysisInput, CombinedCallAnalysisReportOutput } from '@/types';
import { useProductContext } from '@/hooks/useProductContext';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface HistoricalCombinedAnalysisItem extends Omit<ActivityLogEntry, 'details'> {
  details: {
    input: CombinedCallAnalysisInput;
    output: CombinedCallAnalysisReportOutput;
  };
}

const isCombinedAnalysisActivity = (activity: ActivityLogEntry): activity is HistoricalCombinedAnalysisItem => {
  const { details } = activity;
  return (
    typeof details === 'object' &&
    details !== null &&
    'input' in details &&
    'output' in details &&
    typeof (details as { input?: unknown }).input === 'object' &&
    typeof (details as { output?: unknown }).output === 'object'
  );
};

export default function CombinedCallAnalysisDashboardPage() {
  const { activities } = useActivityLogger();
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();
  const { availableProducts } = useProductContext();
  const [productFilter, setProductFilter] = useState<string>("All");
  const [selectedItem, setSelectedItem] = useState<HistoricalCombinedAnalysisItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const combinedAnalysisHistory: HistoricalCombinedAnalysisItem[] = useMemo(() => {
    if (!isClient) return [];
    return (activities || [])
      .filter((activity): activity is HistoricalCombinedAnalysisItem => 
        activity.module === "Combined Call Analysis" && isCombinedAnalysisActivity(activity))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [activities, isClient]);

  const filteredHistory = useMemo(() => {
    if (productFilter === 'All') {
      return combinedAnalysisHistory;
    }
    return combinedAnalysisHistory.filter(item => item.product === productFilter);
  }, [combinedAnalysisHistory, productFilter]);
  
  const handleViewDetails = (item: HistoricalCombinedAnalysisItem) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  };

  const handleExportTable = (formatType: 'csv' | 'pdf' | 'doc') => {
    if (filteredHistory.length === 0) {
      toast({ title: "No Data", description: `No combined analysis history for '${productFilter}' to export.` });
      return;
    }
    try {
      const headers = ["Timestamp", "Product Focus", "Calls Analyzed", "Avg Score", "Batch Category", "Executive Summary"];
      const dataForExportObjects = filteredHistory.map(item => {
        const output = item.details.output;
        return {
          Timestamp: format(parseISO(item.timestamp), 'yyyy-MM-dd HH:mm:ss'),
          ProductFocus: output.productFocus,
          CallsAnalyzed: output.numberOfCallsAnalyzed,
          AvgScore: output.averageOverallScore?.toFixed(2) ?? 'N/A',
          BatchCategory: output.overallBatchCategorization || 'N/A',
          ExecutiveSummary: (output.batchExecutiveSummary || '').substring(0, 100) + '...',
        };
      });

      const dataRowsForPdfOrDoc = dataForExportObjects.map(row => Object.values(row));
      const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
      const baseFilename = `combined_analysis_history_${productFilter}_${timestamp}`;

      if (formatType === 'csv') exportToCsv(`${baseFilename}.csv`, dataForExportObjects);
      else if (formatType === 'pdf') void exportTableDataToPdf(`${baseFilename}.pdf`, headers, dataRowsForPdfOrDoc);
      else if (formatType === 'doc') exportTableDataForDoc(`${baseFilename}.doc`, headers, dataRowsForPdfOrDoc);
      
      toast({ title: "Export Successful", description: `Combined analysis history exported as ${formatType.toUpperCase()}.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Export Failed", description: `Could not export history. Error: ${error instanceof Error ? error.message : String(error)}`});
    }
  };


  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Combined Call Analysis Dashboard" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        <div className="flex justify-between items-center">
            <div className='flex items-center gap-2'>
                <Label htmlFor="product-filter" className="text-sm">Product:</Label>
                <Select value={productFilter} onValueChange={setProductFilter}>
                    <SelectTrigger id="product-filter" className="w-[180px]">
                        <SelectValue placeholder="Filter by product" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All Products</SelectItem>
                        {availableProducts.map(p => <SelectItem key={p.name} value={p.name}>{p.displayName}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
           <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline"><List className="mr-2 h-4 w-4" /> Export Options</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExportTable('csv')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Export Table as CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportTable('pdf')}><FileText className="mr-2 h-4 w-4" /> Export Table as PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportTable('doc')}><FileText className="mr-2 h-4 w-4" /> Export Table as Text for Word</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isClient ? (
          <Card className="shadow-md">
            <CardHeader>
                <CardTitle>Combined Analysis Reports</CardTitle>
                <CardDescription>History of aggregated call scoring reports.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[calc(100vh-380px)]">
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-center">Calls Analyzed</TableHead>
                            <TableHead className="text-center">Average Score</TableHead>
                            <TableHead>Overall Categorization</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {filteredHistory.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No combined analysis reports found for &#39;{productFilter}&#39;.</TableCell></TableRow>
                        ) : (
                            filteredHistory.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="text-xs">{format(parseISO(item.timestamp), 'PP p')}</TableCell>
                                <TableCell><Badge variant="secondary">{item.product}</Badge></TableCell>
                                <TableCell className="text-center">{item.details.output.numberOfCallsAnalyzed}</TableCell>
                                <TableCell className="text-center font-mono font-semibold">{item.details.output.averageOverallScore?.toFixed(2) ?? 'N/A'}</TableCell>
                                <TableCell className="max-w-[200px] truncate" title={item.details.output.overallBatchCategorization}>{item.details.output.overallBatchCategorization}</TableCell>
                                <TableCell className="text-right">
                                <Button variant="outline" size="xs" onClick={() => handleViewDetails(item)}><Eye className="mr-1.5 h-3.5 w-3.5" /> View Report</Button>
                                </TableCell>
                            </TableRow>
                            ))
                        )}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" /> <Skeleton className="h-20 w-full" /> <Skeleton className="h-20 w-full" /> <Skeleton className="h-20 w-full" />
          </div>
        )}

        {selectedItem && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="sm:max-w-4xl md:max-w-5xl lg:max-w-6xl max-h-[90vh] flex flex-col p-0">
                <DialogHeader className="p-4 pb-3 border-b sticky top-0 bg-background z-10">
                <DialogTitle className="text-lg text-primary">Combined Call Analysis Report</DialogTitle>
                <DialogDesc className="text-xs">
                    Product: {selectedItem.product || "N/A"} | Generated: {format(parseISO(selectedItem.timestamp), 'PPPP pppp')}
                </DialogDesc>
                </DialogHeader>
                <ScrollArea className="grow p-4 overflow-y-auto">
                    <CombinedCallAnalysisResultsCard 
                        report={selectedItem.details.output}
                        individualScores={selectedItem.details.input.callReports || []}
                    />
                </ScrollArea>
                <DialogFooter className="p-3 border-t bg-muted/50 sticky bottom-0">
                    <Button onClick={() => setIsDialogOpen(false)} size="sm">Close</Button>
                </DialogFooter>
            </DialogContent>
            </Dialog>
        )}
      </main>
    </div>
  );
}
