"use client";

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Eye, Star, AlertTriangle, CheckCircle, ShieldCheck, ShieldAlert, Loader2, Clock, Download, ChevronDown, FileText } from 'lucide-react';
import { CallScoringResultsCard } from './call-scoring-results-card';
import { Product, HistoricalScoreItem } from '@/types';
import type { BatchProgressItem } from '@/components/common/batch-progress-list';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";


interface CallScoringResultsTableProps {
  results: HistoricalScoreItem[];
  progressById?: Record<string, BatchProgressItem>;
}

export function CallScoringResultsTable({ results, progressById }: CallScoringResultsTableProps) {
  const [selectedResult, setSelectedResult] = useState<HistoricalScoreItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const handleViewDetails = (result: HistoricalScoreItem) => {
    setSelectedResult(result);
    setIsDialogOpen(true);
  };
  
  const renderStars = (score: number, small: boolean = false) => {
    const stars = [];
    const starClass = small ? "h-3.5 w-3.5" : "h-5 w-5";
    for (let i = 1; i <= 5; i++) {
      if (score >= i) {
        stars.push(<Star key={i} className={`${starClass} text-yellow-400 fill-yellow-400`} />);
      } else {
        stars.push(<Star key={i} className={`${starClass} text-muted-foreground/50`} />);
      }
    }
    return stars;
  };

  const getCategoryFromScore = (score: number): string => {
    if (score >= 4.5) return "Excellent";
    if (score >= 3.5) return "Good";
    if (score >= 2.5) return "Average";
    if (score >= 1.5) return "Needs Improvement";
    return "Poor";
  };
  

  const getCategoryBadgeVariant = (category?: string): "default" | "secondary" | "destructive" | "outline" => {
    if(!category) return "secondary";
    switch (category.toLowerCase()) {
      case 'excellent': return 'default';
      case 'good': return 'secondary';
      case 'average': return 'outline';
      case 'needs improvement': return 'destructive';
      case 'poor': return 'destructive';
      case 'error': return 'destructive';
      default: return 'secondary';
    }
  };
  
  const renderStatus = (item: HistoricalScoreItem) => {
    const progress = progressById?.[item.id];
    const status = progress?.status
      ? progress.status === 'success'
        ? 'Complete'
        : progress.status === 'failed'
          ? 'Failed'
          : progress.status === 'running'
            ? item.details.status ?? 'Running'
            : 'Queued'
      : item.details.status;

    const progressValue = typeof progress?.progress === 'number' ? Math.min(Math.max(progress.progress, 0), 100) : undefined;
    const stepMessage = progress?.message || item.details.status;

    switch(status) {
      case 'Queued':
        return (
          <div className="flex flex-col items-center gap-1 text-xs">
            <Badge variant="outline" className="text-xs">
              <Clock className="mr-1 h-3 w-3"/>Queued
            </Badge>
            {progressValue !== undefined && (
              <div className="w-full min-w-[120px]">
                <Progress value={progressValue} className="h-1.5" />
              </div>
            )}
            {stepMessage && (
              <span className="text-[10px] text-muted-foreground text-center leading-tight">
                {stepMessage}
              </span>
            )}
          </div>
        );
      case 'Transcribing':
      case 'Scoring':
        return (
          <div className="flex flex-col items-center gap-1 text-xs">
            <Badge variant="secondary" className="text-xs">
              <Loader2 className="mr-1 h-3 w-3 animate-spin"/>{status}...
            </Badge>
            {progressValue !== undefined && (
              <div className="w-full min-w-[120px]">
                <Progress value={progressValue} className="h-1.5" />
              </div>
            )}
            {stepMessage && (
              <span className="text-[10px] text-muted-foreground text-center leading-tight">
                {stepMessage}
              </span>
            )}
          </div>
        );
      case 'Complete':
        return (
          <div className="flex flex-col items-center gap-1 text-xs">
            <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-300">
              <CheckCircle className="mr-1 h-3 w-3"/>Complete
            </Badge>
            {progressValue !== undefined && progressValue < 100 && (
              <div className="w-full min-w-[120px]">
                <Progress value={progressValue} className="h-1.5" />
              </div>
            )}
            {stepMessage && (
              <span className="text-[10px] text-muted-foreground text-center leading-tight">
                {stepMessage}
              </span>
            )}
          </div>
        );
      case 'Failed':
         return (
          <div className="flex flex-col items-center gap-1 text-xs">
            <Badge variant="destructive" className="cursor-pointer text-xs" title={item.details.error}>
              <AlertTriangle className="mr-1 h-3 w-3"/>Failed
            </Badge>
            {progressValue !== undefined && (
              <div className="w-full min-w-[120px]">
                <Progress value={progressValue} className="h-1.5" />
              </div>
            )}
            {stepMessage && (
              <span className="text-[10px] text-muted-foreground text-center leading-tight">
                {stepMessage}
              </span>
            )}
          </div>
         );
      default:
        return (
          <div className="flex flex-col items-center gap-1 text-xs">
            <Badge variant="outline" className="text-xs">
              Unknown ({status})
            </Badge>
            {progressValue !== undefined && (
              <div className="w-full min-w-[120px]">
                <Progress value={progressValue} className="h-1.5" />
              </div>
            )}
            {stepMessage && (
              <span className="text-[10px] text-muted-foreground text-center leading-tight">
                {stepMessage}
              </span>
            )}
          </div>
        );
    }
  }
  

  return (
    <>
      <div className="w-full max-w-5xl mt-8 shadow-lg rounded-lg border bg-card">
        <div className="p-6">
            <h2 className="text-xl font-semibold text-primary">Scoring Results</h2>
            <p className="text-sm text-muted-foreground">Results for {results.length} item(s).</p>
        </div>
        <ScrollArea className="h-[calc(100vh-450px)] md:h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50 backdrop-blur-xs z-10">
              <TableRow>
                <TableHead className="w-[50px]">SNo.</TableHead>
                <TableHead>File Name / Source</TableHead>
                <TableHead className="text-center w-[150px]">Overall Score</TableHead>
                <TableHead className="text-center w-[150px]">Categorization</TableHead>
                <TableHead className="text-center w-[200px]">Status</TableHead>
                <TableHead className="text-right w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No call scoring jobs initiated yet.
                  </TableCell>
                </TableRow>
              ) : (
                results.map((result, index) => {
                  const scoreOutput = result.details.scoreOutput;
                  const overallScore = scoreOutput?.overallScore;
                  const category = scoreOutput?.callCategorisation;

                  return (
                    <TableRow key={result.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium max-w-xs truncate" title={result.details.fileName}>
                        {result.details.fileName}
                      </TableCell>
                      <TableCell className="text-center">
                        {scoreOutput && typeof overallScore === 'number' ? (
                          <>
                            <div className="flex items-center justify-center gap-1" title={`${overallScore.toFixed(1)}/5`}>
                              {renderStars(overallScore, true)}
                            </div>
                            <span className="text-xs text-muted-foreground">({overallScore.toFixed(1)}/5)</span>
                          </>
                        ) : '...'}
                      </TableCell>
                      <TableCell className="text-center">
                         {category ? <Badge variant={getCategoryBadgeVariant(category)} className="text-xs">{category}</Badge> : '...'}
                      </TableCell>
                      <TableCell className="text-center text-xs" title={result.details.status}>
                        {renderStatus(result)}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(result)}
                            title={"View Full Scoring Report"}
                            disabled={!result.details.scoreOutput}
                        >
                          <Eye className="mr-1.5 h-4 w-4" /> Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {selectedResult && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl min-h-[70vh] max-h-[85vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-2 border-b">
                <DialogTitle className="text-xl text-primary">Detailed Call Scoring Report</DialogTitle>
                <DialogDescription>
                    File: {selectedResult.details.fileName}
                </DialogDescription>
            </DialogHeader>
            <ScrollArea className="grow overflow-y-auto">
              <div className="p-6">
                  {selectedResult.details.scoreOutput ? (
                    <CallScoringResultsCard
                        results={selectedResult.details.scoreOutput}
                        fileName={selectedResult.details.fileName}
                        agentName={selectedResult.agentName}
                        product={selectedResult.product as Product}
                        audioDataUri={selectedResult.details.audioDataUri}
                        isHistoricalView={true}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-8">
                       <AlertTriangle className="h-10 w-10 text-destructive mb-4" />
                       <h3 className="text-lg font-semibold">Report Not Available</h3>
                       <p className="text-sm text-muted-foreground mt-2">The job status is '{selectedResult.details.status}'. A detailed report can only be viewed once the job is complete.</p>
                       {selectedResult.details.error && (
                            <div className="mt-4 text-left">
                                <p className="font-semibold">Error Details:</p>
                                <pre className="text-xs bg-destructive/10 text-destructive-foreground p-2 rounded-md whitespace-pre-wrap">
                                    {selectedResult.details.error}
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
