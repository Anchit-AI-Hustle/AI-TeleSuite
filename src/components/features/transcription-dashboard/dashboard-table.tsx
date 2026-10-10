
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from '@/hooks/use-toast';
import { exportPlainTextFile, downloadDataUriFile } from '@/lib/export';
import { exportTextContentToPdf } from '@/lib/pdf-utils';
import { Badge } from "@/components/ui/badge";
import { Eye, ArrowUpDown, FileText, Download, Copy, ShieldCheck, ShieldAlert, Trash2, List } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { HistoricalTranscriptionItem } from '@/types';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useActivityLogger } from '@/hooks/use-activity-logger';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TranscriptViewer } from '@/components/transcript/TranscriptViewer';
import { normalizeTranscript } from '@/lib/transcript/normalize';
import { TranscriptFeedbackComponent, TranscriptFeedbackBadge } from '../transcript-feedback';
import { formatTranscriptSegments } from '@/lib/transcript-utils';

interface TranscriptionDashboardTableProps {
  history: HistoricalTranscriptionItem[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

type SortKey = 'fileName' | 'segments' | 'timestamp' | null;
type SortDirection = 'asc' | 'desc';


export function TranscriptionDashboardTable({ history, selectedIds, onSelectionChange }: TranscriptionDashboardTableProps) {
  const [selectedItem, setSelectedItem] = useState<HistoricalTranscriptionItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

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


  const handleViewDetails = (item: HistoricalTranscriptionItem) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  };

  const handleCopyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => toast({ title: "Success", description: "Transcript copied to clipboard!" }))
      .catch(() => toast({ variant: "destructive", title: "Error", description: "Failed to copy transcript." }));
  };

  const handleDownloadDoc = (text: string, fileName: string) => { 
    if (!text || !fileName) return;
    try {
      const docFilename = (fileName ? (fileName.includes('.') ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName) : "transcript") + "_transcript.doc";
      exportPlainTextFile(docFilename, text);
      toast({ title: "Success", description: `Transcript Text for Word (.doc) '${docFilename}' downloaded.` });
    } catch (error) {
       toast({ variant: "destructive", title: "Error", description: "Failed to download Text for Word (.doc)." });
    }
  };

  const handleDownloadPdf = (text: string, fileName: string) => {
    if (!text || !fileName) return;
    try {
      const pdfFilename = (fileName ? (fileName.includes('.') ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName) : "transcript") + "_transcript.pdf";
      exportTextContentToPdf(text, pdfFilename);
      toast({ title: "Success", description: `Transcript PDF '${pdfFilename}' downloaded.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to download PDF." });
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

  const getAccuracyIcon = (assessment?: string) => {
    if (!assessment) return <ShieldAlert className="h-4 w-4 text-muted-foreground" />;
    const lowerAssessment = assessment.toLowerCase();
    if (lowerAssessment.includes("high")) return <ShieldCheck className="h-4 w-4 text-green-500" />;
    if (lowerAssessment.includes("medium")) return <ShieldCheck className="h-4 w-4 text-yellow-500" />;
    if (lowerAssessment.includes("low") || lowerAssessment.includes("error")) return <ShieldAlert className="h-4 w-4 text-red-500" />;
    return <ShieldAlert className="h-4 w-4 text-muted-foreground" />;
  };

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      let valA: number | string | undefined;
      let valB: number | string | undefined;

      switch (sortKey) {
        case 'fileName':
          valA = a.details.fileName?.toLowerCase();
          valB = b.details.fileName?.toLowerCase();
          break;
        case 'segments':
          // Sort by segment count instead of old accuracyAssessment
          valA = a.details.transcriptionOutput?.segments?.length || 0;
          valB = b.details.transcriptionOutput?.segments?.length || 0;
          break;
        case 'timestamp':
          valA = new Date(a.timestamp).getTime();
          valB = new Date(b.timestamp).getTime();
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
                <TableHead>Transcript Preview</TableHead>
                <TableHead onClick={() => requestSort('segments')} className="cursor-pointer text-center w-[200px]">Segments {getSortIndicator('segments')}</TableHead>
                <TableHead className="text-center w-[180px]">Audio</TableHead>
                <TableHead onClick={() => requestSort('timestamp')} className="cursor-pointer">Date Transcribed {getSortIndicator('timestamp')}</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No transcripts found. Transcribe some audio to see them here.
                  </TableCell>
                </TableRow>
              ) : (
                sortedHistory.map((item) => {
                  // Format transcript using standard utility instead of old diarizedTranscript field
                  const transcriptText = item.details.transcriptionOutput?.segments 
                    ? formatTranscriptSegments(item.details.transcriptionOutput)
                    : '';
                  const hasError = !!item.details.error;
                  const segmentCount = item.details.transcriptionOutput?.segments?.length || 0;

                  return (
                    <TableRow key={item.id} data-state={selectedIds.includes(item.id) ? "selected" : undefined}>
                      <TableCell>
                          <Checkbox
                              checked={selectedIds.includes(item.id)}
                              onCheckedChange={(checked) => handleSelectOne(item.id, !!checked)}
                              aria-label={`Select row for ${item.details.fileName}`}
                          />
                      </TableCell>
                      <TableCell className="font-medium max-w-xs truncate" title={item.details.fileName}>
                        <FileText className="inline-block mr-2 h-4 w-4 text-muted-foreground" />
                        {item.details.fileName}
                      </TableCell>
                      <TableCell className="max-w-sm">
                        {hasError || !transcriptText ? (
                          <span className="text-destructive italic text-xs">{item.details.error || "Transcript not available."}</span>
                        ) : (
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap wrap-break-word truncate_3_lines">
                            {transcriptText.substring(0, 150)}{transcriptText.length > 150 ? '...' : ''}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.details.audioDataUri ? (
                          <div className="flex items-center justify-center gap-2">
                            <audio controls src={item.details.audioDataUri} className="h-8 w-36">
                              Your browser does not support the audio element.
                            </audio>
                            <Button
                              variant="outline"
                              size="icon"
                              title="Download original audio"
                              onClick={() => downloadDataUriFile(item.details.audioDataUri!, item.details.fileName || 'transcription_audio.wav')}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No audio</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-xs" title={`${segmentCount} segments`}>
                        <Badge variant="outline" className="font-mono">
                          {segmentCount}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(parseISO(item.timestamp), 'PP p')}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(item)}
                            title={"View Full Transcript"}
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
          <DialogContent className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl h-[85vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-2 border-b">
                <DialogTitle className="text-primary flex items-center">Historical Transcript: {selectedItem.details.fileName}</DialogTitle>
                <DialogDescription>
                    Generated on: {format(parseISO(selectedItem.timestamp), 'PP p')}
                    {selectedItem.agentName && `, By: ${selectedItem.agentName}`}
                </DialogDescription>
            </DialogHeader>
            <div className="p-4 sm:p-6 grow overflow-y-hidden flex flex-col">
              <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
                   <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant="outline">
                        {selectedItem.details.transcriptionOutput?.segments?.length || 0} segments
                      </Badge>
                      <Badge variant="outline">
                        {selectedItem.details.transcriptionOutput?.callMeta?.durationSeconds 
                          ? `${Math.floor(selectedItem.details.transcriptionOutput.callMeta.durationSeconds / 60)}m ${Math.floor(selectedItem.details.transcriptionOutput.callMeta.durationSeconds % 60)}s`
                          : 'Duration unknown'}
                      </Badge>
                  </div>
                  <div className="flex gap-2">
                     {(() => {
                       const formattedText = selectedItem.details.transcriptionOutput?.segments
                         ? formatTranscriptSegments(selectedItem.details.transcriptionOutput)
                         : selectedItem.details.error || '';
                       return (
                         <>
                           <Button variant="outline" size="xs" onClick={() => handleCopyToClipboard(formattedText)} disabled={!formattedText}><Copy className="mr-1 h-3"/>Copy Text</Button>
                           <Button variant="outline" size="xs" onClick={() => handleDownloadPdf(formattedText, selectedItem.details.fileName)} disabled={!formattedText}><FileText className="mr-1 h-3"/>PDF</Button>
                         </>
                       );
                     })()}
                 </div>
              </div>
              {selectedItem.details.audioDataUri && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground"><FileText className="h-4 w-4 text-primary"/>Original Audio</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <audio controls src={selectedItem.details.audioDataUri} className="h-9 w-full">
                      Your browser does not support the audio element.
                    </audio>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Download original audio"
                      onClick={() => downloadDataUriFile(selectedItem.details.audioDataUri!, selectedItem.details.fileName || 'transcription_audio.wav')}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              <ScrollArea className="grow w-full rounded-md border p-3 bg-background">
                  {selectedItem.details.error ? (
                    <div className="h-full flex items-center justify-center">
                        <p className="text-destructive text-center p-4">Error during transcription: {selectedItem.details.error}</p>
                    </div>
                  ) : selectedItem.details.transcriptionOutput?.segments ? (
                    <TranscriptViewer 
                      transcript={normalizeTranscript(
                        { segments: selectedItem.details.transcriptionOutput.segments }, 
                        { source: 'transcription-dashboard', mergeConsecutiveTurns: true }
                      )} 
                      showTimestamps={true}
                      agentPosition="left"
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-muted-foreground text-center">Transcript data is not available for this entry.</p>
                    </div>
                  )}
              </ScrollArea>
            </div>
            <DialogFooter className="p-4 border-t bg-muted/50">
              <Button onClick={() => setIsDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <style jsx global>{`
        .truncate_3_lines {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </>
  );
}
