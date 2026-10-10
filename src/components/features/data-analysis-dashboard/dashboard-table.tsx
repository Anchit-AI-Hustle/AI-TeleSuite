
"use client";

import { useState, useMemo } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogDesc, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Eye, ArrowUpDown, FileText, Download, Lightbulb, Settings, AlertCircle, BookOpen, MessageCircleQuestion, List, FileSpreadsheet, ChevronDown, File } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { HistoricalAnalysisReportItem, DataAnalysisReportOutput, DataAnalysisInput } from '@/types';
import { DataAnalysisResultsCard } from '@/components/features/data-analysis/data-analysis-results-card';
import { useToast } from '@/hooks/use-toast';
import { exportTextContentToPdf } from '@/lib/pdf-utils';
import { exportPlainTextFile } from '@/lib/export';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


type SortKey = 'userAnalysisPromptShort' | 'timestamp' | 'reportTitle' | 'fileCount' | null;
type SortDirection = 'asc' | 'desc';

interface DataAnalysisDashboardTableProps {
  history: HistoricalAnalysisReportItem[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function DataAnalysisDashboardTable({ history, selectedIds, onSelectionChange }: DataAnalysisDashboardTableProps) {
  const [selectedItem, setSelectedItem] = useState<HistoricalAnalysisReportItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleViewDetails = (item: HistoricalAnalysisReportItem) => {
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

  const formatReportForTextExport = (report: DataAnalysisReportOutput, input: DataAnalysisInput): string => {
    let output = `Data Analysis Report: ${report.reportTitle || "Untitled Report"}\n\n`;
    output += `User Prompt (Specific to this run):\n${input.userAnalysisPrompt || "N/A"}\n\n`;
    output += `File Context Provided (${input.fileDetails?.length || 0} files):\n${(input.fileDetails || []).map((fileDetail: DataAnalysisInput['fileDetails'][number]) => `- ${fileDetail.fileName} (Type: ${fileDetail.fileType})`).join('\n')}\n\n`;
    if (input.sampledFileContent) output += `Sampled Text Content (from first CSV/TXT):\n${input.sampledFileContent}\n\n`;

    output += `--- Executive Summary ---\n${report.executiveSummary || "N/A"}\n\n`;
    
    if (report.directInsightsFromSampleText) {
        output += `--- Direct Insights From Sampled Data ---\n${report.directInsightsFromSampleText}\n\n`;
    }

    output += "--- Key Metrics ---\n";
    (report.keyMetrics || []).forEach((metric) => {
      output += `  Metric: ${metric.metricName}: ${metric.value}\n`;
      if (metric.trendOrComparison) output += `  Trend/Comparison: ${metric.trendOrComparison}\n`;
      if (metric.insight) output += `  Insight: ${metric.insight}\n`;
      output += `\n`;
    });
    
    output += "--- Detailed Analysis ---\n";
    if (report.detailedAnalysis.timeSeriesTrends) output += `Time-Series Trends:\n${report.detailedAnalysis.timeSeriesTrends}\n\n`;
    if (report.detailedAnalysis.comparativePerformance) output += `Comparative Performance:\n${report.detailedAnalysis.comparativePerformance}\n\n`;
    if (report.detailedAnalysis.useCaseSpecificInsights) output += `Use-Case Specific Insights:\n${report.detailedAnalysis.useCaseSpecificInsights}\n\n`;


    output += "--- Recommendations ---\n";
    (report.recommendations || []).forEach((rec) => {
        output += `  Area: ${rec.area}\n  Recommendation: ${rec.recommendation}\n`;
        if(rec.justification) output += `  Justification: ${rec.justification}\n`;
        output += `\n`;
    });

    output += `--- Limitations & Disclaimer ---\n${report.limitationsAndDisclaimer || "N/A"}\n`;
    return output;
  };

  const handleDownloadReport = (item: HistoricalAnalysisReportItem, formatType: "pdf" | "doc") => {
    if (!item.details.analysisOutput || item.details.error) {
      toast({ variant: "destructive", title: "Download Error", description: "Report content is not available due to an error." });
      return;
    }
    const report = item.details.analysisOutput;
    const inputData = item.details.inputData;

    const filenameBase = `AnalysisReport_${(report.reportTitle || "Untitled").replace(/[^a-z0-9]/gi, '_').slice(0,30)}_${format(parseISO(item.timestamp), 'yyyyMMddHHmmss')}`;
    const textContent = formatReportForTextExport(report, inputData);

    if (formatType === "pdf") {
      exportTextContentToPdf(textContent, `${filenameBase}.pdf`);
      toast({ title: "PDF Report Exported", description: `${filenameBase}.pdf has been downloaded.` });
    } else if (formatType === "doc") {
      exportPlainTextFile(`${filenameBase}.doc`, textContent);
      toast({ title: "Text for Word (.doc) Exported", description: `${filenameBase}.doc has been downloaded.` });
    }
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

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      let valA: number | string | undefined;
      let valB: number | string | undefined;

      switch (sortKey) {
        case 'userAnalysisPromptShort':
          valA = (a.details.inputData.userAnalysisPrompt || "").substring(0,50).toLowerCase();
          valB = (b.details.inputData.userAnalysisPrompt || "").substring(0,50).toLowerCase();
          break;
        case 'reportTitle':
          valA = a.details.analysisOutput?.reportTitle?.toLowerCase() || (a.details.error ? 'error' : '');
          valB = b.details.analysisOutput?.reportTitle?.toLowerCase() || (b.details.error ? 'error' : '');
          break;
        case 'timestamp':
          valA = new Date(a.timestamp).getTime();
          valB = new Date(b.timestamp).getTime();
          break;
        case 'fileCount':
          valA = a.details.inputData.fileDetails?.length || 0;
          valB = b.details.inputData.fileDetails?.length || 0;
          break;
        default:
          return 0;
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
        <ScrollArea className="h-[calc(100vh-280px)] md:h-[calc(100vh-250px)]">
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
                <TableHead onClick={() => requestSort('reportTitle')} className="cursor-pointer">Report Title {getSortIndicator('reportTitle')}</TableHead>
                <TableHead onClick={() => requestSort('userAnalysisPromptShort')} className="cursor-pointer">User Prompt (Start) {getSortIndicator('userAnalysisPromptShort')}</TableHead>
                <TableHead onClick={() => requestSort('fileCount')} className="cursor-pointer text-center">Files Context {getSortIndicator('fileCount')}</TableHead>
                <TableHead onClick={() => requestSort('timestamp')} className="cursor-pointer">Date Generated {getSortIndicator('timestamp')}</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No Analysis Reports generated yet.
                  </TableCell>
                </TableRow>
              ) : (
                sortedHistory.map((item) => {
                  const userPrompt = item.details.inputData.userAnalysisPrompt || "";
                  const promptSummary = userPrompt.substring(0, 70);
                  return (
                    <TableRow key={item.id} data-state={selectedIds.includes(item.id) ? "selected" : undefined}>
                       <TableCell>
                          <Checkbox
                              checked={selectedIds.includes(item.id)}
                              onCheckedChange={(checked) => handleSelectOne(item.id, !!checked)}
                              aria-label={`Select row for ${item.details.analysisOutput?.reportTitle || 'report'}`}
                          />
                      </TableCell>
                      <TableCell className="font-medium max-w-[250px] truncate" title={item.details.analysisOutput?.reportTitle || "N/A"}>
                        <Lightbulb className="inline-block mr-2 h-4 w-4 text-primary" />
                        {item.details.error ? <Badge variant="destructive">Error Generating Report</Badge> : item.details.analysisOutput?.reportTitle || <span className="text-xs text-muted-foreground italic">Untitled Report</span>}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-xs" title={userPrompt}>
                          {promptSummary}{userPrompt.length > 70 ? "..." : ""}
                      </TableCell>
                       <TableCell className="text-center">
                          <Badge variant="outline" title={(item.details.inputData.fileDetails || []).map(f => f.fileName).join(', ')}>
                              {(item.details.inputData.fileDetails || []).length} file(s)
                          </Badge>
                      </TableCell>
                      <TableCell>{format(parseISO(item.timestamp), 'PP p')}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Download options" disabled={!!item.details.error || !item.details.analysisOutput}>
                               <Download className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleDownloadReport(item, "pdf")} disabled={!!item.details.error || !item.details.analysisOutput}>
                                <FileText className="mr-2 h-4 w-4"/> Download as PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadReport(item, "doc")} disabled={!!item.details.error || !item.details.analysisOutput}>
                                <Download className="mr-2 h-4 w-4"/> Download as Text for Word
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(item)}
                            title={"View Full Analysis Report"}
                        >
                          <Eye className="mr-1.5 h-4 w-4" /> View
                        </Button>
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
          <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-5xl min-h-[80vh] max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-2 border-b">
                <DialogTitle className="text-xl text-primary">Data Analysis Report</DialogTitle>
                <DialogDesc>
                    Report: {selectedItem.details.analysisOutput?.reportTitle || (selectedItem.details.error ? "Error" : "Untitled")} | Generated: {format(parseISO(selectedItem.timestamp), 'PP p')}
                </DialogDesc>
            </DialogHeader>
            <ScrollArea className="grow overflow-y-auto">
              <div className="p-3 md:p-6">
                {selectedItem.details.error ? (
                     <div className="space-y-3 text-sm text-destructive bg-destructive/10 p-4 rounded-md">
                        <p className="font-semibold text-lg">Error During Report Generation:</p>
                        <Label htmlFor="error-input-prompt" className="font-medium">User Prompt:</Label>
                        <Textarea id="error-input-prompt" value={selectedItem.details.inputData.userAnalysisPrompt || "N/A"} readOnly className="min-h-[100px] bg-background/50" />
                        <Label className="font-medium">File Context:</Label>
                        <pre className="text-xs bg-background/50 p-2 rounded-md">{(selectedItem.details.inputData.fileDetails || []).map(f=>`- ${f.fileName} (${f.fileType})`).join('\n') || "None"}</pre>
                        <p><strong>Error Message:</strong> {selectedItem.details.error}</p>
                    </div>
                ) : selectedItem.details.analysisOutput ? (
                  <>
                    {/* Show uploaded files with download buttons */}
                    {selectedItem.details.inputData.fileDetails && selectedItem.details.inputData.fileDetails.some(f => f.fileDataUri) && (
                      <div className="mb-4 p-3 bg-muted/50 rounded-md">
                        <h4 className="font-semibold text-sm mb-2 flex items-center"><File className="mr-2 h-4 w-4"/>Input Files</h4>
                        <div className="space-y-2">
                          {selectedItem.details.inputData.fileDetails.map((file, idx) => file.fileDataUri && (
                            <div key={idx} className="flex items-center justify-between gap-2 p-2 bg-background rounded border text-xs">
                              <div className="flex-1 truncate">
                                <span className="font-medium">{file.fileName}</span>
                                <span className="text-muted-foreground ml-2">({file.fileType})</span>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const link = document.createElement('a');
                                  link.href = file.fileDataUri!;
                                  link.download = file.fileName;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                  toast({ title: "Download Started", description: `Downloading ${file.fileName}` });
                                }}
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Download
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <DataAnalysisResultsCard
                      reportOutput={selectedItem.details.analysisOutput}
                      userAnalysisPrompt={selectedItem.details.inputData.userAnalysisPrompt}
                      fileContext={selectedItem.details.inputData.fileDetails}
                    />
                  </>
                ) : (
                    <p className="text-muted-foreground">No analysis report output available for this entry.</p>
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
