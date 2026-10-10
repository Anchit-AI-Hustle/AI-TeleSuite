
"use client";

import { useState, useMemo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Eye, Star, ArrowUpDown, AlertTriangle, CheckCircle, Download, FileText, ChevronDown, Loader2, Clock, Mic, Bot } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { CallScoringResultsCard } from '../call-scoring/call-scoring-results-card';
import { useToast } from '@/hooks/use-toast';
import { generateCallScoreReportPdfBlob } from '@/lib/pdf-utils';
import { exportPlainTextFile } from '@/lib/export';
import {
  groupMetricScoresByCategory,
  computeMetricCategoryAverages,
  formatCategoryAverage,
  metricCategoryDefinitions,
  UNCATEGORIZED_CATEGORY_KEY,
} from '@/lib/call-scoring-categories';
import type { HistoricalScoreItem, Product, ScoreCallOutput } from '@/types';

interface CallScoringDashboardTableProps {
  history: HistoricalScoreItem[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

type SortKey = 'overallScore' | 'callCategorisation' | 'transcriptAccuracy' | 'dateScored' | 'fileName' | 'agentName' | 'product' | 'source';
type SortDirection = 'asc' | 'desc';

export function CallScoringDashboardTable({ history, selectedIds, onSelectionChange }: CallScoringDashboardTableProps) {
  const [selectedItem, setSelectedItem] = useState<HistoricalScoreItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const [sortKey, setSortKey] = useState<SortKey>('dateScored');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleViewDetails = (item: HistoricalScoreItem) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  };
  
  const isAllSelected = history.length > 0 && selectedIds.length === history.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(history.map(item => item.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedIds, id]);
    } else {
      onSelectionChange(selectedIds.filter(itemId => itemId !== id));
    }
  };

  const formatReportForTextExport = (item: HistoricalScoreItem): string => {
    const { scoreOutput, fileName, agentNameFromForm: agentName, status, error } = item.details;
    const { product, timestamp } = item;
    
    if (!scoreOutput || status !== 'Complete') {
        return `--- Call Scoring Report for: ${fileName} ---\n\nStatus: ${status}\n${error ? `Error: ${error}\n` : ''}`;
    }

    const { overallScore, callCategorisation, summary, strengths, areasForImprovement, redFlags, metricScores, transcript, conversionReadiness, suggestedDisposition, improvementSituations } = scoreOutput;
    
    let output = `--- Call Scoring Report ---\n\n`;
    output += `File Name: ${fileName}\n`;
    output += `Agent Name: ${agentName || "N/A"}\n`;
    output += `Product Focus: ${product || "General"}\n`;
    output += `Date Scored: ${format(parseISO(timestamp), 'PP p')}\n\n`;
    
    output += `Overall Score: ${overallScore?.toFixed(1) || 'N/A'}/5\n`;
    output += `Categorization: ${callCategorisation || 'N/A'}\n`;
    output += `Conversion Readiness: ${conversionReadiness || 'N/A'}\n`;
    output += `Suggested Disposition: ${suggestedDisposition || 'N/A'}\n\n`;
    
    output += `--- SUMMARY & FEEDBACK ---\n`;
    output += `Summary: ${summary}\n\n`;
    output += `Strengths:\n- ${(strengths || []).join('\n- ')}\n\n`;
    output += `Areas for Improvement:\n- ${(areasForImprovement || []).join('\n- ')}\n\n`;
    if (redFlags && redFlags.length > 0) {
      output += `RED FLAGS:\n- ${redFlags.join('\n- ')}\n\n`;
    }
    
    output += `--- DETAILED METRICS ---\n`;
    const grouped = groupMetricScoresByCategory(metricScores);
    const averages = computeMetricCategoryAverages(metricScores);
    const orderedCategories = [
      ...metricCategoryDefinitions.map((definition) => definition.key),
      ...(grouped.has(UNCATEGORIZED_CATEGORY_KEY) ? [UNCATEGORIZED_CATEGORY_KEY] : []),
    ];

    orderedCategories.forEach((category) => {
      const metrics = grouped.get(category);
      if (!metrics || metrics.length === 0) return;
      const avgLabel = formatCategoryAverage(averages.get(category));
      output += `Category: ${category} (Avg: ${avgLabel})\n`;
      metrics.forEach((metric) => {
        output += `  Metric: ${metric.metric}\n`;
        output += `    Score: ${metric.score}/5\n`;
        output += `    Category Avg: ${avgLabel}\n`;
        output += `    Feedback: ${metric.feedback}\n\n`;
      });
    });

    if (improvementSituations && improvementSituations.length > 0) {
      output += `--- SITUATIONS FOR IMPROVEMENT ---\n\n`;
      improvementSituations.forEach((sit, index) => {
          output += `SITUATION ${index + 1}:\n`;
          if (sit.timeInCall) output += `  Time in Call: ${sit.timeInCall}\n`;
          output += `  Context: ${sit.context}\n`;
          if (sit.userDialogue) output += `  User Said: "${sit.userDialogue}"\n`;
          output += `  Agent's Actual Response: "${sit.agentResponse}"\n`;
          output += `  Suggested Better Response: "${sit.suggestedResponse}"\n\n`;
      });
    }
    
    output += `--- FULL TRANSCRIPT ---\n${transcript}\n`;
    return output;
  };

  const handleDownloadReport = async (item: HistoricalScoreItem, format: 'pdf' | 'doc') => {
    try {
      if (!item.details.scoreOutput) {
        throw new Error("Report content is not available for this item.");
      }
      const filenameBase = `Call_Report_${item.details.fileName.replace(/[^a-zA-Z0-9]/g, '_')}`;

      if (format === 'pdf') {
        const pdfBlob = await generateCallScoreReportPdfBlob(item);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(pdfBlob);
        link.download = `${filenameBase}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast({ title: "Report Exported", description: `PDF report for ${item.details.fileName} has been downloaded.` });
      } else {
        const textContent = formatReportForTextExport(item);
        exportPlainTextFile(`${filenameBase}.doc`, textContent);
        toast({ title: "Report Exported", description: `Text report for ${item.details.fileName} has been downloaded.` });
      }
    } catch(error) {
      toast({ variant: "destructive", title: "Download Error", description: error instanceof Error ? error.message : "An unknown error occurred" });
      console.error("Download Error:", error);
    }
  };

  const renderStars = (score: number) => {
    const fullStars = Math.floor(score);
    const partialStar = score % 1;
    const stars = [];

    for (let i = 0; i < fullStars; i++) {
        stars.push(<Star key={`full-${i}`} className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />);
    }
    
    if (partialStar > 0.2) { // Render partial star only if it's significant
      stars.push(
        <div key="partial" className="relative h-3.5 w-3.5">
          <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-200" />
          <div className="absolute top-0 left-0 h-full overflow-hidden" style={{ width: `${partialStar * 100}%`}}>
            <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
          </div>
        </div>
      );
    }

    const emptyStars = 5 - stars.length;
    for (let i = 0; i < emptyStars; i++) {
        stars.push(<Star key={`empty-${i}`} className="h-3.5 w-3.5 text-muted-foreground/50" />);
    }
    return stars;
  };

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortKey === key && sortDirection === 'asc') {
      direction = 'desc';
    }
    setSortKey(key);
    setSortDirection(direction);
  };

  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? <ArrowUpDown className="ml-1 h-3 w-3 inline transform rotate-180" /> : <ArrowUpDown className="ml-1 h-3 w-3 inline" />;
  };
  
  const renderStatus = (item: HistoricalScoreItem) => {
    const status = item.details.status;
    if (status === 'Pending') {
      return <Badge variant="secondary" className="text-xs"><Loader2 className="mr-1 h-3 w-3 animate-spin"/> Pending...</Badge>;
    }
    switch(status) {
      case 'Queued':
        return <Badge variant="outline" className="text-xs"><Clock className="mr-1 h-3 w-3"/> Queued</Badge>;
      case 'Transcribing':
      case 'Scoring':
        return <Badge variant="secondary" className="text-xs"><Loader2 className="mr-1 h-3 w-3 animate-spin"/> {status}...</Badge>;
      case 'Complete':
        return <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-300 text-xs"><CheckCircle className="mr-1 h-3 w-3"/> Complete</Badge>;
      case 'Failed':
         return <Badge variant="destructive" className="cursor-pointer text-xs" title={item.details.error}><AlertTriangle className="mr-1 h-3 w-3"/> Failed</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
        let valA: number | string | undefined;
        let valB: number | string | undefined;

        switch (sortKey) {
          case 'overallScore': valA = a.details.scoreOutput?.overallScore; valB = b.details.scoreOutput?.overallScore; break;
          case 'callCategorisation': valA = a.details.scoreOutput?.callCategorisation; valB = b.details.scoreOutput?.callCategorisation; break;
          case 'transcriptAccuracy': valA = a.details.scoreOutput?.transcriptAccuracy; valB = b.details.scoreOutput?.transcriptAccuracy; break;
          case 'dateScored': valA = new Date(a.timestamp).getTime(); valB = new Date(b.timestamp).getTime(); break;
          case 'fileName': valA = a.details.fileName; valB = b.details.fileName; break;
          case 'agentName': valA = a.agentName; valB = b.agentName; break;
          case 'product': valA = a.product; valB = b.product; break;
          case 'source': valA = a.details.source; valB = b.details.source; break;
          default: return 0;
        }

        let comparison = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        } else if (typeof valA === 'string' && typeof valB === 'string') {
          comparison = valA.localeCompare(valB);
        } else {
          if (valA === undefined || valA === null) comparison = -1;
          else if (valB === undefined || valB === null) comparison = 1;
        }
        return sortDirection === 'desc' ? comparison * -1 : comparison;
      });
  }, [history, sortKey, sortDirection]);


  return (
    <>
      <div className="w-full mt-2 shadow-lg rounded-lg border bg-card">
        <ScrollArea className="h-[calc(100vh-340px)] md:h-[calc(100vh-310px)]">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50 backdrop-blur-xs z-10">
              <TableRow>
                 <TableHead className="w-[50px]">
                    <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                        aria-label="Select all"
                    />
                </TableHead>
                <TableHead onClick={() => requestSort('fileName')} className="cursor-pointer">File Name {getSortIndicator('fileName')}</TableHead>
                <TableHead onClick={() => requestSort('source')} className="cursor-pointer">Source {getSortIndicator('source')}</TableHead>
                <TableHead onClick={() => requestSort('agentName')} className="cursor-pointer">Agent {getSortIndicator('agentName')}</TableHead>
                <TableHead onClick={() => requestSort('overallScore')} className="cursor-pointer text-center">Score {getSortIndicator('overallScore')}</TableHead>
                <TableHead onClick={() => requestSort('dateScored')} className="cursor-pointer">Date {getSortIndicator('dateScored')}</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No call scoring history found.
                  </TableCell>
                </TableRow>
              ) : (
                sortedHistory.map((item) => {
                  const scoreOutput = item.details?.scoreOutput;
                  const overallScore = scoreOutput?.overallScore;
                  
                  return (
                    <TableRow key={item.id} data-state={selectedIds.includes(item.id) ? "selected" : undefined}>
                      <TableCell>
                          <Checkbox
                              checked={selectedIds.includes(item.id)}
                              onCheckedChange={(checked) => handleSelectOne(item.id, !!checked)}
                              aria-label={`Select row for ${item.details.fileName}`}
                          />
                      </TableCell>
                      <TableCell className="font-medium max-w-[250px] truncate" title={item.details.fileName}>
                        {item.details.fileName}
                      </TableCell>
                      <TableCell>
                          <Badge variant={item.details.source === 'Manual' ? 'outline' : 'secondary'}>
                              {item.details.source === 'Manual' ? <Mic className="w-3 h-3 mr-1.5"/> : <Bot className="w-3 h-3 mr-1.5"/>}
                              {item.details.source}
                          </Badge>
                      </TableCell>
                      <TableCell>{item.agentName || 'N/A'}</TableCell>
                      <TableCell className="text-center">
                        {typeof overallScore === 'number' ? (
                            <div className="flex flex-col items-center gap-1">
                                <span className="font-semibold text-sm">{overallScore.toFixed(1)}/5</span>
                                <div className="flex gap-0.5">{renderStars(overallScore)}</div>
                            </div>
                        ) : '...'}
                      </TableCell>
                      <TableCell>{format(parseISO(item.timestamp), 'PP p')}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(item)}
                            title={"View Full Scoring Report"}
                        >
                          <Eye className="mr-1.5 h-4 w-4" /> Report
                        </Button>
                         <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                               <Button 
                                  variant="outline" 
                                  size="icon" 
                                  className="h-9 w-9"
                                  disabled={!scoreOutput}
                                  title={!scoreOutput ? "Report not available" : "Download report options"}
                                >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleDownloadReport(item, 'pdf')}>
                                <FileText className="mr-2 h-4 w-4"/> Download as PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownloadReport(item, 'doc')}>
                                <Download className="mr-2 h-4 w-4"/> Download as Text for Word
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {selectedItem && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl min-h-[70vh] max-h-[85vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-2 border-b">
                <DialogTitle className="text-xl text-primary">Detailed Call Scoring Report (Historical)</DialogTitle>
                <DialogDescription>
                    File: {selectedItem.details.fileName} (Scored on: {format(parseISO(selectedItem.timestamp), 'PP p')})
                    {selectedItem.details.agentNameFromForm && `, Agent: ${selectedItem.details.agentNameFromForm}`}
                </DialogDescription>
            </DialogHeader>
            <ScrollArea className="grow overflow-y-auto">
              <div className="p-6">
                {selectedItem.details.scoreOutput ? (
                    <CallScoringResultsCard 
                        results={selectedItem.details.scoreOutput} 
                        fileName={selectedItem.details.fileName} 
                        agentName={selectedItem.agentName}
                        product={selectedItem.product as Product}
                        audioDataUri={selectedItem.details.audioDataUri}
                        isHistoricalView={true} 
                    />
                ) : (
                    <div className="text-center p-8">
                        <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
                        <h3 className="mt-4 font-semibold text-lg">Report Not Available</h3>
                        <p className="text-sm text-muted-foreground mt-2">
                           This job is in '{selectedItem.details.status}' status. A detailed report can only be viewed once the job is complete.
                        </p>
                        {selectedItem.details.error && (
                            <div className="mt-4 text-left">
                                <p className="font-semibold">Error Details:</p>
                                <pre className="text-xs bg-destructive/10 text-destructive-foreground p-2 rounded-md whitespace-pre-wrap">
                                    {selectedItem.details.error}
                                </pre>
                            </div>
                        )}
                    </div>
                )}
              </div>
            </ScrollArea>
            <DialogFooter className="p-4 border-t bg-muted/50">
              <Button onClick={() => setIsDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
