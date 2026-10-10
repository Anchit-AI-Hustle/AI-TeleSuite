
"use client";

import React, { useState, ChangeEvent, useRef } from 'react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DownloadCloud, AlertTriangle, CheckCircle, Loader2, FileSpreadsheet, Columns, WifiOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useActivityLogger } from '@/hooks/use-activity-logger';

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

type InputType = 'urls' | 'excel';

export default function BatchAudioDownloaderPage() {
  const [inputType, setInputType] = useState<InputType>('urls');
  const [urls, setUrls] = useState<string>('');
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [urlColumn, setUrlColumn] = useState<string>('');
  const [sheetName, setSheetName] = useState<string>('');
  const [zipFilename, setZipFilename] = useState<string>('audio_batch.zip');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [currentStatus, setCurrentStatus] = useState<string>('');
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [successCount, setSuccessCount] = useState<number>(0);
  const { toast } = useToast();
  const { logActivity } = useActivityLogger();
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  const getFilenameFromUrl = (url: string, index: number): string => {
    try {
      const parsedUrl = new URL(url);
      let pathname = parsedUrl.pathname;
      if (pathname.endsWith('/')) {
        pathname = pathname.substring(0, pathname.length - 1);
      }
      const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
      if (filename && filename.includes('.')) {
        return decodeURIComponent(filename);
      } else if (filename) {
        if (url.toLowerCase().includes('.mp3')) return `${decodeURIComponent(filename)}.mp3`;
        if (url.toLowerCase().includes('.wav')) return `${decodeURIComponent(filename)}.wav`;
        if (url.toLowerCase().includes('.m4a')) return `${decodeURIComponent(filename)}.m4a`;
        if (url.toLowerCase().includes('.ogg')) return `${decodeURIComponent(filename)}.ogg`;
        return `${decodeURIComponent(filename)}.audio`;
      }
    } catch { /* ignore */ }
    return `audio_file_${index + 1}.audio`;
  };

  const handleExcelFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.type === 'application/vnd.ms-excel' || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        setExcelFile(file);
        setErrorMessages([]);
      } else {
        toast({ variant: "destructive", title: "Invalid File Type", description: "Please upload a valid Excel file (.xlsx or .xls)." });
        setExcelFile(null);
        if(excelFileInputRef.current) excelFileInputRef.current.value = "";
      }
    }
  };

  const extractUrlsFromExcel = async (): Promise<string[]> => {
    if (!excelFile) {
      toast({ variant: "destructive", title: "No Excel File", description: "Please upload an Excel file." });
      return [];
    }
    if (!urlColumn.trim()) {
      toast({ variant: "destructive", title: "Missing Column Name", description: "Please specify the column header name containing the URLs." });
      return [];
    }

    setCurrentStatus('Parsing Excel file...');
    setProgress(5);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const targetSheetName = sheetName.trim() || workbook.SheetNames[0];
          
          if (!workbook.SheetNames.includes(targetSheetName)) {
            setErrorMessages(prev => [...prev, `Sheet "${targetSheetName}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`]);
            reject(new Error(`Sheet "${targetSheetName}" not found.`));
            return;
          }
          const worksheet = workbook.Sheets[targetSheetName];
          const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });

          if (jsonData.length === 0) {
            setErrorMessages(prev => [...prev, `Sheet "${targetSheetName}" is empty or has no data.`]);
            reject(new Error(`Sheet "${targetSheetName}" is empty.`));
            return;
          }
          
          const headers = Object.keys(jsonData[0]);
          if (!headers.includes(urlColumn.trim())) {
             setErrorMessages(prev => [...prev, `Column header "${urlColumn.trim()}" not found in sheet "${targetSheetName}". Available headers: ${headers.join(', ')}`]);
             reject(new Error(`Column header "${urlColumn.trim()}" not found.`));
             return;
          }

          const extractedUrls = jsonData
            .map(row => row[urlColumn.trim()])
            .filter((url): url is string => typeof url === 'string' && url.trim().length > 0 && (url.startsWith('http://') || url.startsWith('https://')))
            .map(url => url.trim());
          
          if (extractedUrls.length === 0) {
             setErrorMessages(prev => [...prev, `No valid URLs found in column "${urlColumn.trim()}" of sheet "${targetSheetName}". Ensure URLs start with http:// or https://.`]);
             reject(new Error('No valid URLs found in the specified column.'));
             return;
          }
          
          setCurrentStatus(`Found ${extractedUrls.length} URLs from Excel.`);
          setProgress(10);
          resolve(extractedUrls);
        } catch (error: unknown) {
          const errorMessage = getErrorMessage(error);
          console.error("Error parsing Excel:", error);
          setErrorMessages(prev => [...prev, `Error parsing Excel file: ${errorMessage}`]);
          reject(error instanceof Error ? error : new Error(errorMessage));
        }
      };
      reader.onerror = (error) => {
        console.error("Error reading Excel file:", error);
        setErrorMessages(prev => [...prev, "Failed to read the Excel file."]);
        reject(new Error('Failed to read the Excel file.'));
      };
      reader.readAsBinaryString(excelFile);
    });
  };


  const handleDownload = async () => {
    let urlList: string[] = [];
    setIsLoading(true);
    setProgress(0);
    setErrorMessages([]);
    setSuccessCount(0);
    setCurrentStatus('Preparing download...');

    if (inputType === 'excel') {
      try {
        urlList = await extractUrlsFromExcel();
      } catch {
        setIsLoading(false);
        setProgress(0);
        setCurrentStatus('Failed to process Excel file.');
        return;
      }
    } else {
      urlList = urls.split('\n').map(url => url.trim()).filter(url => url.length > 0);
    }

    if (urlList.length === 0) {
      toast({ variant: "destructive", title: "No URLs", description: inputType === 'excel' ? "No valid URLs extracted from Excel or Excel processing failed." : "Please enter or extract at least one audio URL." });
      setIsLoading(false);
      return;
    }

    const zip = new JSZip();
    let localSuccessCount = 0;
    const localErrorMessages: string[] = [];

    logActivity({
      module: "Batch Audio Downloader",
      details: {
        action: "initiate_download",
        inputType: inputType,
        urlCount: urlList.length,
        requestedZipName: zipFilename,
        excelFileName: inputType === 'excel' ? excelFile?.name : undefined,
        excelUrlColumn: inputType === 'excel' ? urlColumn : undefined,
        excelSheetName: inputType === 'excel' ? sheetName : undefined,
      }
    });

    for (let i = 0; i < urlList.length; i++) {
      const url = urlList[i];
      const filename = getFilenameFromUrl(url, i);
      setCurrentStatus(`Fetching (${i + 1}/${urlList.length}): ${filename}...`);
      const baseProgress = inputType === 'excel' ? 10 : 0;
      setProgress(baseProgress + ((i + 1) / urlList.length) * (inputType === 'excel' ? 80 : 90));

      try {
        const response = await fetch(url); 
        if (!response.ok) {
          throw new Error(`Download failed with status: ${response.status} ${response.statusText}. Server may not allow direct downloads (CORS) or file not found.`);
        }
        const blob = await response.blob();
        
        if (!blob.type.startsWith('audio/')) {
            console.warn(`File ${filename} from ${url} might not be an audio file (MIME type: ${blob.type}). Adding to ZIP anyway.`);
        }
        
        zip.file(filename, blob);
        localSuccessCount++;
        setSuccessCount(prev => prev + 1);
      } catch (error: unknown) {
        const baseMessage = getErrorMessage(error);
        let errorMessage = `Error downloading ${filename} (from ${url}): ${baseMessage}`;
        if (baseMessage.toLowerCase().includes('failed to fetch')) {
            errorMessage += " This often happens due to CORS (Cross-Origin Resource Sharing) restrictions on the server hosting the audio. The server needs to allow downloads from this web application's domain.";
        }
        console.error(errorMessage, error);
        localErrorMessages.push(errorMessage);
        setErrorMessages(prev => [...prev, errorMessage]);
      }
    }
    setSuccessCount(localSuccessCount);


    if (localSuccessCount > 0) {
      setCurrentStatus('Zipping files...');
      setProgress(95);
      try {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setProgress(100);
        setCurrentStatus('Download ready!');

        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        toast({ title: "Download Complete", description: `${zipFilename} downloaded with ${localSuccessCount} file(s).` });
        logActivity({
          module: "Batch Audio Downloader",
          details: {
            action: "download_success",
            inputType: inputType,
            zipName: link.download,
            filesDownloaded: localSuccessCount,
            filesFailed: localErrorMessages.length,
            failedUrls: localErrorMessages.map(e => e.split('(from ')[1]?.split(')')[0]).filter(Boolean)
          }
        });

      } catch (zipError: unknown) {
        const zipErrorMessage = `Error creating ZIP file: ${getErrorMessage(zipError)}`;
        setErrorMessages(prev => [...prev, zipErrorMessage]);
        toast({ variant: "destructive", title: "ZIP Creation Failed", description: zipErrorMessage });
         logActivity({
          module: "Batch Audio Downloader",
          details: {
            action: "download_zip_failed",
            inputType: inputType,
            error: zipErrorMessage,
            filesProcessed: localSuccessCount,
            filesInitiallyFailed: localErrorMessages.length,
          }
        });
      }
    } else if (localErrorMessages.length > 0) {
      toast({ variant: "destructive", title: "All Downloads Failed", description: "None of the provided URLs could be downloaded. Check error messages below." });
      logActivity({
        module: "Batch Audio Downloader",
        details: {
          action: "download_all_failed",
          inputType: inputType,
          urlCount: urlList.length,
          failedUrls: localErrorMessages.map(e => e.split('(from ')[1]?.split(')')[0]).filter(Boolean)
        }
      });
    } else {
        toast({ variant: "default", title: "No Files Processed", description: "No URLs were processed."});
    }

    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Batch Audio Downloader" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col items-center space-y-6">
        <Alert variant="default" className="w-full max-w-2xl bg-amber-50 border-amber-200 text-amber-800">
            <WifiOff className="h-4 w-4" />
            <AlertTitle className="text-amber-900">Important Note on CORS</AlertTitle>
            <AlertDescription className="text-xs">
              This tool downloads files directly in your browser. Success depends on the external server&#39;s CORS (Cross-Origin Resource Sharing) policy. If you see &quot;Failed to fetch&quot; errors, it means the server hosting the audio does not permit downloads from other websites. This is a browser security feature, not a bug in this application.
            </AlertDescription>
        </Alert>
        <Card className="w-full max-w-2xl shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl flex items-center">
              <DownloadCloud className="mr-2 h-6 w-6 text-primary" />
              Download Multiple Audio Files
            </CardTitle>
            <CardDescription>
              Paste direct audio URLs or upload an Excel file. Files will be bundled into a ZIP archive.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={inputType} onValueChange={(value) => setInputType(value as InputType)} className="flex space-x-4 mb-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="urls" id="input-urls" />
                <Label htmlFor="input-urls">Paste URLs</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="excel" id="input-excel" />
                <Label htmlFor="input-excel">Upload Excel</Label>
              </div>
            </RadioGroup>

            {inputType === 'urls' && (
              <div>
                <Label htmlFor="audio-urls">Audio URLs (one per line)</Label>
                <Textarea
                  id="audio-urls"
                  placeholder="https://example.com/audio1.mp3\nhttps://example.com/another_audio.wav\n..."
                  value={urls}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setUrls(e.target.value)}
                  rows={8}
                  disabled={isLoading}
                  className="mt-1"
                />
              </div>
            )}

            {inputType === 'excel' && (
              <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                <div>
                  <Label htmlFor="excel-file-upload" className="flex items-center"><FileSpreadsheet className="mr-2 h-4 w-4"/>Upload Excel File (.xlsx, .xls)</Label>
                  <Input
                    id="excel-file-upload"
                    type="file"
                    ref={excelFileInputRef}
                    accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    onChange={handleExcelFileChange}
                    disabled={isLoading}
                    className="mt-1 pt-1.5"
                  />
                  {excelFile && <p className="text-xs text-muted-foreground mt-1">Selected: {excelFile.name}</p>}
                </div>
                <div>
                  <Label htmlFor="url-column" className="flex items-center"><Columns className="mr-2 h-4 w-4"/>Column Header Name with URLs</Label>
                  <Input
                    id="url-column"
                    value={urlColumn}
                    onChange={(e) => setUrlColumn(e.target.value)}
                    placeholder="e.g., AudioLink or Download URL"
                    disabled={isLoading}
                    className="mt-1"
                  />
                   <p className="text-xs text-muted-foreground mt-0.5">Enter the exact header name of the column containing the audio links.</p>
                </div>
                <div>
                  <Label htmlFor="sheet-name">Sheet Name (Optional)</Label>
                  <Input
                    id="sheet-name"
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    placeholder="e.g., Sheet1 (if blank, uses first sheet)"
                    disabled={isLoading}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
            
            <div className="mt-4">
              <Label htmlFor="zip-filename">ZIP File Name</Label>
              <Input
                id="zip-filename"
                value={zipFilename}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setZipFilename(e.target.value)}
                placeholder="audio_batch.zip"
                disabled={isLoading}
                className="mt-1"
              />
            </div>
            <Button 
                onClick={() => void handleDownload()} 
                disabled={isLoading || (inputType === 'urls' && !urls.trim()) || (inputType === 'excel' && (!excelFile || !urlColumn.trim()))} 
                className="w-full mt-6!"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <DownloadCloud className="mr-2 h-4 w-4" />
              )}
              {isLoading ? `Processing... (${Math.round(progress)}%)` : 'Download All as ZIP'}
            </Button>

            {isLoading && (
              <div className="space-y-2 mt-3">
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-muted-foreground text-center">{currentStatus}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {(!isLoading && errorMessages.length > 0) && (
          <Card className="w-full max-w-2xl shadow-md mt-4">
            <CardHeader>
              <CardTitle className="text-lg text-destructive flex items-center">
                <AlertTriangle className="mr-2 h-5 w-5" /> Download Errors ({errorMessages.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertDescription>
                  <ScrollArea className="h-32">
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      {errorMessages.map((err, index) => (
                        <li key={index}>{err}</li>
                      ))}
                    </ul>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
              {successCount > 0 && (
                  <Alert variant="default" className="mt-3 bg-green-50 border-green-200 text-green-700">
                    <CheckCircle className="h-4 w-4"/>
                    <AlertTitle className="text-green-800">Partial Success</AlertTitle>
                    <AlertDescription>
                      Successfully downloaded and zipped {successCount} file(s).
                    </AlertDescription>
                  </Alert>
              )}
            </CardContent>
          </Card>
        )}
        
        {!isLoading && successCount > 0 && errorMessages.length === 0 && (
            <Alert variant="default" className="w-full max-w-2xl bg-green-50 border-green-200 text-green-700">
                <CheckCircle className="h-4 w-4"/>
                <AlertTitle className="text-green-800">All Downloads Successful!</AlertTitle>
                <AlertDescription>
                    All {successCount} files were processed and included in the ZIP.
                </AlertDescription>
            </Alert>
        )}
      </main>
    </div>
  );
}
    
