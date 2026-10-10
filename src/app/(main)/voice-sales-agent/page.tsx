
"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingSpinner } from '@/components/common/loading-spinner';
import { ConversationTurn as ConversationTurnComponent } from '@/components/features/voice-agents/conversation-turn';
import { Badge } from "@/components/ui/badge";

import { useToast } from '@/hooks/use-toast';
import { useActivityLogger } from '@/hooks/use-activity-logger';
import { useKnowledgeBase } from '@/hooks/use-knowledge-base';
import { useWhisper } from '@/hooks/useWhisper';
import { useProductContext } from '@/hooks/useProductContext';
import { GOOGLE_PRESET_VOICES, SAMPLE_TEXT } from '@/hooks/use-voice-samples';
import { synthesizeSpeechOnClient } from '@/lib/tts-client';
import { formatTranscriptSegments } from '@/lib/transcript-utils';
import { buildProductKnowledgeBaseContext } from '@/lib/knowledge-base-context';
import { downloadDataUriFile } from '@/lib/export';
import { useAppVersion } from '@/context/app-version-context';

import {
    Product, SalesPlan, CustomerCohort,
    ConversationTurn, GeneratePitchOutput,
    ScoreCallOutput,
    VoiceSalesAgentFlowInput, VoiceSalesAgentActivityDetails, TranscriptionOutput
} from '@/types';

import { PhoneCall, AlertTriangle, Bot, User as UserIcon, Info, Mic, Radio, PhoneOff, Redo, Settings, Volume2, Loader2, SquareTerminal, Star, PlayCircle, FileAudio } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PostCallReviewProps } from '@/components/features/voice-sales-agent/post-call-review';

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

type ExtendedWindow = Window & { webkitAudioContext?: typeof AudioContext };

const shouldIgnorePlaybackError = (error: unknown): boolean => {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name ?? '')
      : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : '';
  return name === 'AbortError' || message.includes('The play() request was interrupted');
};

// Dynamically import the PostCallReview component to reduce initial page load size
const PostCallReview = dynamic<PostCallReviewProps>(
  () => import('@/components/features/voice-sales-agent/post-call-review').then((mod) => mod.PostCallReview),
  {
    loading: () => (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin"/> Loading call review...
        </div>
    ),
    ssr: false
  }
);

const AFFIRMATIVE_KEYWORDS = new Set([
  "ok", "okay", "k", "kk", "alright", "all right", "sure", "yah", "ya", "yeah",
  "yep", "yup", "mm", "hmm", "mmhmm", "mhmm", "right", "correct", "go on",
  "continue", "please continue", "tell me more", "sounds good", "makes sense",
  "great", "cool", "awesome", "perfect", "proceed", "carry on"
]);

const QUESTION_SIGNAL_REGEX = /(\?|why|when|where|who|what|how|price|cost|discount|plan|offer|detail|explain|help|support)/i;

const shouldAutoContinuePitch = (userInput: string): boolean => {
  const normalized = userInput.trim().toLowerCase();
  if (!normalized) return true;
  if (QUESTION_SIGNAL_REGEX.test(normalized)) return false;
  if (normalized.includes("not") || normalized.startsWith("no")) return false;
  if (AFFIRMATIVE_KEYWORDS.has(normalized)) return true;
  return normalized.length <= 18 && normalized.split(/\s+/).length <= 3;
};

const getNextPitchSection = (
  conversation: ConversationTurn[],
  pitch?: GeneratePitchOutput | null
): { text: string; isFinal: boolean } | null => {
  if (!pitch) return null;
  const saidTexts = new Set(
    conversation
      .filter(turn => turn.speaker === 'AI')
      .map(turn => turn.text?.trim())
      .filter(Boolean)
  );

  const sectionOrder: Array<{ key: keyof GeneratePitchOutput; isFinal?: boolean }> = [
    { key: 'personalizedHook' },
    { key: 'productExplanation' },
    { key: 'keyBenefitsAndBundles' },
    { key: 'discountOrDealExplanation' },
    { key: 'objectionHandlingPreviews' },
    { key: 'finalCallToAction', isFinal: true },
  ];

  for (const section of sectionOrder) {
    const value = pitch[section.key];
    if (typeof value === 'string' && value.trim().length > 0 && !saidTexts.has(value.trim())) {
      return { text: value, isFinal: Boolean(section.isFinal) };
    }
  }
  return null;
};


const mapSpeakerToRole = (speaker: ConversationTurn['speaker']): 'AGENT' | 'USER' =>
  speaker === 'AI' ? 'AGENT' : 'USER';

const SILENCE_TIMEOUT_MS = 650; // Wait ~0.65s before finalizing user turn
const MAX_SILENCE_DURATION_MS = 1600;
const MIN_VOICE_DURATION_MS = 260;
const VOICE_SALES_MODULE = 'AI Voice Sales Agent';

type CallState = "IDLE" | "CONFIGURING" | "LISTENING" | "PROCESSING" | "AI_SPEAKING" | "ENDED" | "ERROR";

export default function VoiceSalesAgentPage() {
  const [callState, setCallState] = useState<CallState>("CONFIGURING");
  const callStateRef = useRef(callState);
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  const [currentTranscription, setCurrentTranscription] = useState("");
  const [isClient, setIsClient] = useState(false);

  const [agentName, setAgentName] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  const { availableProducts, getProductByName } = useProductContext();
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>("ET");
  const productInfo = getProductByName(selectedProduct || "");
  const [selectedSalesPlan, setSelectedSalesPlan] = useState<SalesPlan | undefined>();
  const [selectedSpecialConfig, setSelectedSpecialConfig] = useState<string | undefined>();
  const [offerDetails, setOfferDetails] = useState<string>("");
  const [selectedCohort, setSelectedCohort] = useState<CustomerCohort | undefined>("Payment Dropoff");

  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentPitch, setCurrentPitch] = useState<GeneratePitchOutput | null>(null);
  const [finalCallArtifacts, setFinalCallArtifacts] = useState<{ transcript: string, transcriptAccuracy?: string, audioUri?: string, score?: ScoreCallOutput } | null>(null);

  // Store last call config for redial functionality
  const [lastCallConfig, setLastCallConfig] = useState<{
    product: Product | undefined;
    cohort: CustomerCohort | undefined;
    agentName: string;
    userName: string;
    salesPlan: SalesPlan | undefined;
    specialConfig: string | undefined;
    offerDetails: string;
    voiceId: string;
  } | null>(null);

  const [currentRecordingDataUri, setCurrentRecordingDataUri] = useState<string | null>(null);
  const [isRecordingBuffering, setIsRecordingBuffering] = useState(false);
  const recordingAudioRef = useRef<HTMLAudioElement | null>(null);
  const supportsMediaRecorder = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [isAutoEnding, setIsAutoEnding] = useState(false);

  const { toast } = useToast();
  const { activities, logActivity, updateActivity } = useActivityLogger();
  const { files: allKbFiles } = useKnowledgeBase();
  const conversationEndRef = useRef<null | HTMLDivElement>(null);
  const currentActivityId = useRef<string | null>(null);
  const liveUserTurnIdRef = useRef<string | null>(null);
  const { appVersion } = useAppVersion();
  const isOpenSourceVersion = appVersion === 'open-source';

  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(GOOGLE_PRESET_VOICES[0].id);
  const isCallInProgress = callState !== 'CONFIGURING' && callState !== 'IDLE' && callState !== 'ENDED';
  const canRecordCalls =
    supportsMediaRecorder &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function';
  const [isVoicePreviewPlaying, setIsVoicePreviewPlaying] = useState(false);

  const productKbFiles = useMemo(() => {
      if (!selectedProduct || !allKbFiles) return [];
      return allKbFiles.filter(f => f.product === selectedProduct);
  }, [allKbFiles, selectedProduct]);

  // Clear KB context cache when product or files change
  useEffect(() => {
    kbContextCacheRef.current = null;
  }, [productKbFiles, selectedProduct, selectedCohort]);

  // Cache for knowledge base context to avoid reprocessing on every turn
  const kbContextCacheRef = useRef<{filesHash: string, productName: string, cohort: string, context: string} | null>(null);

  const getCachedKnowledgeContext = useCallback(() => {
    if (!productInfo) {
      return 'No product information available.';
    }

    const currentFilesHash = productKbFiles
      .map(f => `${f.id}-${f.name}-${f.product}-${f.category}`)
      .join('|');
    const cache = kbContextCacheRef.current;

    if (
      cache &&
      cache.filesHash === currentFilesHash &&
      cache.productName === productInfo.name &&
      cache.cohort === (selectedCohort || '')
    ) {
      return cache.context;
    }

    const newContext = buildProductKnowledgeBaseContext(productKbFiles, productInfo, {
      customerCohort: selectedCohort,
    });

    kbContextCacheRef.current = {
      filesHash: currentFilesHash,
      productName: productInfo.name,
      cohort: selectedCohort || '',
      context: newContext,
    };

    return newContext;
  }, [productKbFiles, productInfo, selectedCohort]);

  const requestOpenSourceAgentResponse = useCallback(async (
    conversationSeed: ConversationTurn[],
    userInputText: string,
    isInitialTurn: boolean
  ) => {
    const kbContext = getCachedKnowledgeContext();
    const historyLines = conversationSeed.map(turn => `${turn.speaker}: ${turn.text}`).join('\n');
    const prompt = `You are an AI voice sales agent named ${agentName || 'Alex'} representing ${productInfo?.displayName || 'our product'} for customer ${userName || 'there'}.\n\nSales context:\n- Customer cohort: ${selectedCohort}\n- Offer: ${offerDetails || 'Standard plan'}\n- Sales plan: ${selectedSalesPlan || 'Default'}\n\nKnowledge Base:\n${kbContext}\n\nConversation so far:\n${historyLines || '(Call has not started yet)'}\n\nLatest user input: ${userInputText || '(The agent is opening the call)'}\n\nTask: ${isInitialTurn ? 'Open the call with a warm introduction, mention the core value, and ask a friendly question.' : 'Respond helpfully, move the sale forward, and ask for a micro-commitment.'}\n\nRules:\n- Keep the response under 80 words.\n- Use natural spoken language (no stage directions).\n- End with either a question or a suggested next action.`;

    const response = await fetch('/api/oss/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, temperature: 0.6 }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    const text = (data?.text || '').trim();
    if (!text) {
      throw new Error('Open source LLM returned an empty response');
    }
    return text;
  }, [agentName, getCachedKnowledgeContext, offerDetails, productInfo?.displayName, selectedCohort, selectedSalesPlan, userName]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const lastChunkCleanupRef = useRef<number>(Date.now());
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const agentSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const setupRecordingGraph = useCallback(async () => {
    if (!supportsMediaRecorder || !audioPlayerRef.current) {
      return;
    }
    if (!audioContextRef.current) {
      const extendedWindow = window as ExtendedWindow;
      const AudioContextCtor = window.AudioContext ?? extendedWindow.webkitAudioContext;
      if (!AudioContextCtor) {
        console.warn('VoiceAgent: Web Audio API is not supported in this browser.');
        return;
      }
      audioContextRef.current = new AudioContextCtor();
    }
    if (audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch (err) {
        console.warn('VoiceAgent: failed to resume audio context', err);
      }
    }
    if (!recordingDestinationRef.current) {
      recordingDestinationRef.current = audioContextRef.current.createMediaStreamDestination();
    }
    if (!micStreamRef.current) {
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    if (micStreamRef.current && !micSourceRef.current && recordingDestinationRef.current) {
      micSourceRef.current = audioContextRef.current.createMediaStreamSource(micStreamRef.current);
      micSourceRef.current.connect(recordingDestinationRef.current);
    }
    // Only create MediaElementSource if it doesn't exist yet to prevent "already connected" error
    if (!agentSourceRef.current && recordingDestinationRef.current && audioPlayerRef.current) {
      agentSourceRef.current = audioContextRef.current.createMediaElementSource(audioPlayerRef.current);
      agentSourceRef.current.connect(audioContextRef.current.destination);
      agentSourceRef.current.connect(recordingDestinationRef.current);
    }
    if (recordingDestinationRef.current && !mediaRecorderRef.current) {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      mediaRecorderRef.current = new MediaRecorder(recordingDestinationRef.current.stream, { mimeType });
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
          
          // Periodic cleanup to prevent memory bloat during long calls
          const now = Date.now();
          if (now - lastChunkCleanupRef.current > 30000) { // Clean up every 30 seconds
            // Keep only the last 10 minutes worth of chunks (assuming 1 second chunks)
            const maxChunks = 600; // 10 minutes * 60 seconds
            if (recordedChunksRef.current.length > maxChunks) {
              const excessChunks = recordedChunksRef.current.length - maxChunks;
              recordedChunksRef.current.splice(0, excessChunks);
              console.log(`VoiceAgent: Cleaned up ${excessChunks} old audio chunks to prevent memory bloat`);
            }
            lastChunkCleanupRef.current = now;
          }
          
          // Update the current recording for seeking
          updateCurrentRecording();
        }
      };
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
      recordedChunksRef.current = [];
      mediaRecorderRef.current.start(1000);
    }
  }, [supportsMediaRecorder]);

  const stopRecordingGraph = useCallback(async () => {
    if (!supportsMediaRecorder) {
      return null;
    }
    let blob: Blob | null = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      blob = await new Promise<Blob>((resolve) => {
        const recorder = mediaRecorderRef.current!;
        const handleStop = () => {
          recorder.removeEventListener('stop', handleStop);
          resolve(
            new Blob(recordedChunksRef.current, {
              type: recorder.mimeType || 'audio/webm',
            })
          );
        };
        recorder.addEventListener('stop', handleStop);
        recorder.stop();
      });
    } else if (recordedChunksRef.current.length > 0) {
      blob = new Blob(recordedChunksRef.current, {
        type: mediaRecorderRef.current?.mimeType || 'audio/webm',
      });
    }

    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    micSourceRef.current?.disconnect();
    micSourceRef.current = null;
    agentSourceRef.current?.disconnect();
    agentSourceRef.current = null;
    recordingDestinationRef.current = null;
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch (err) {
        console.warn('VoiceAgent: failed to close audio context', err);
      }
      audioContextRef.current = null;
    }
    return blob;
  }, [supportsMediaRecorder]);

  const blobToDataUri = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read audio recording.'));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read audio recording.'));
      reader.readAsDataURL(blob);
    });
  }, []);

  const getCurrentRecordingBlob = useCallback(() => {
    if (recordedChunksRef.current.length > 0) {
      return new Blob(recordedChunksRef.current, {
        type: mediaRecorderRef.current?.mimeType || 'audio/webm',
      });
    }
    return null;
  }, []);

  const updateCurrentRecording = useCallback(async () => {
    const blob = getCurrentRecordingBlob();
    if (blob) {
      try {
        const dataUri = await blobToDataUri(blob);
        setCurrentRecordingDataUri(prev => (prev === dataUri ? prev : dataUri));
        requestAnimationFrame(() => {
          recordingAudioRef.current?.load();
        });
      } catch (err) {
        console.warn('Failed to update current recording:', err);
      }
    }
  }, [getCurrentRecordingBlob, blobToDataUri]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const cancelAudio = useCallback(() => {
    audioQueueRef.current = []; // Clear the queue
    if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.removeAttribute('src');
        audioPlayerRef.current.currentTime = 0;
    }
    setCurrentlyPlayingId(null);
    setCurrentWordIndex(-1);
    if (callStateRef.current === 'AI_SPEAKING') {
        setCallState('LISTENING');
    }
  }, []);

  const onTranscribe = useCallback((text: string) => {
    const trimmed = text.trim();
    if (callStateRef.current === 'AI_SPEAKING' && trimmed.length > 0) {
      cancelAudio();
    }
    setCurrentTranscription(text);

    setConversation(prev => {
      const withoutLiveTurns = prev.filter(turn => !turn.isLive);
      if (!trimmed) {
        liveUserTurnIdRef.current = null;
        return withoutLiveTurns;
      }
      const liveTurnId = liveUserTurnIdRef.current ?? `user-live-${Date.now()}`;
      liveUserTurnIdRef.current = liveTurnId;
      const liveTurn: ConversationTurn = {
        id: liveTurnId,
        speaker: 'User',
        text: trimmed,
        timestamp: new Date().toISOString(),
        isLive: true,
      };
      return [...withoutLiveTurns, liveTurn];
    });
  }, [cancelAudio]);

  const handleEndInteractionRef = useRef<((status?: 'Completed' | 'Completed (Page Unloaded)') => Promise<void>) | null>(null);
  const processAgentTurnRef = useRef<((conversation: ConversationTurn[], userInputText: string) => Promise<void>) | null>(null);

  const playAudioSafely = useCallback((audioEl: HTMLAudioElement, onError: (err: unknown) => void) => {
    const playPromise = audioEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err: unknown) => {
        if (shouldIgnorePlaybackError(err)) {
          return;
        }
        onError(err);
      });
    }
  }, []);

  const handleTurnAudioPlayback = useCallback((audioUri: string, turnId: string) => {
    if (!audioPlayerRef.current) return;
    audioQueueRef.current = [];
    audioPlayerRef.current.pause();
    audioPlayerRef.current.src = audioUri;
    audioPlayerRef.current.currentTime = 0;
    setCurrentWordIndex(-1);
    setCurrentlyPlayingId(turnId);
    setCallState('AI_SPEAKING');
    playAudioSafely(audioPlayerRef.current, (e) => {
      console.error('VoiceAgent: playback failed', e);
      setCallState('LISTENING');
    });
  }, [playAudioSafely]);

  const onTranscriptionComplete = useCallback((text: string) => {
      if (callStateRef.current !== 'LISTENING' && callStateRef.current !== 'AI_SPEAKING') {
        return;
      }

      const userInputText = text.trim();
      setCurrentTranscription("");

      let conversationSnapshot: ConversationTurn[] = [];
      setConversation(prev => {
        const withoutLiveTurns = prev.filter(turn => !turn.isLive || turn.id !== liveUserTurnIdRef.current);
        liveUserTurnIdRef.current = null;

        if (!userInputText) {
          conversationSnapshot = withoutLiveTurns;
          return withoutLiveTurns;
        }

        const finalizedTurn: ConversationTurn = {
          id: `user-${Date.now()}`,
          speaker: 'User',
          text: userInputText,
          timestamp: new Date().toISOString(),
        };
        const merged = [...withoutLiveTurns, finalizedTurn];
        conversationSnapshot = merged;
        return merged;
      });

      if (processAgentTurnRef.current) {
        processAgentTurnRef.current(conversationSnapshot, userInputText);
      }
    }, []);

  const { isRecording, startRecording, stopRecording } = useWhisper({
    onTranscriptionComplete: onTranscriptionComplete,
    onTranscribe: onTranscribe,
    silenceTimeout: SILENCE_TIMEOUT_MS,
    inactivityTimeout: 8000,
    enableVAD: true,
    vadConfig: {
      energyThreshold: 25,
      confidenceThreshold: 0.65,
      smoothingFrames: 3,
      minVoiceDuration: MIN_VOICE_DURATION_MS,
      maxSilenceDuration: MAX_SILENCE_DURATION_MS,
      useFrequencyAnalysis: true,
    },
  });

  const synthesizeAndPlay = useCallback(async (text: string, turnId: string) => {
    const trimmed = text?.trim();
    if (!trimmed) {
      setCallState('LISTENING');
      return;
    }

    setCallState('AI_SPEAKING');

    try {
      if (supportsMediaRecorder) {
        await setupRecordingGraph();
      }

      const textToSynthesize = trimmed.replace(/\bET\b/g, 'E T');
      const ttsStartTime = performance.now();
      const synthesisResult = await synthesizeSpeechOnClient({ text: textToSynthesize, voice: selectedVoiceId });
      const ttsEndTime = performance.now();
      console.log(`VoiceAgent: TTS synthesis completed in ${(ttsEndTime - ttsStartTime).toFixed(2)}ms for ${textToSynthesize.length} characters`);
      
      const audioUri = synthesisResult.audioDataUri;

      setConversation(prev =>
        prev.map(turn =>
          turn.id === turnId ? { ...turn, audioDataUri: audioUri } : turn
        )
      );

      if (audioPlayerRef.current) {
        audioQueueRef.current = [];
        setCurrentlyPlayingId(turnId);
        setCurrentWordIndex(-1);
        try {
          if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
          }
        } catch (err) {
          console.warn('VoiceAgent: failed to resume audio context before playback', err);
        }
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = audioUri;
        audioPlayerRef.current.currentTime = 0;
        playAudioSafely(audioPlayerRef.current, (error) => {
          console.error("Audio playback error:", error);
          toast({ variant: 'destructive', title: 'Playback Error', description: `Could not play audio: ${getErrorMessage(error)}` });
          setCallState("LISTENING");
        });
      } else {
        setCallState('LISTENING');
      }
    } catch (error: unknown) {
      console.error("TTS synthesis error:", error);
      toast({ variant: 'destructive', title: 'TTS Error', description: getErrorMessage(error) });
      setCallState('LISTENING');
    }
  }, [selectedVoiceId, toast, supportsMediaRecorder, setupRecordingGraph, playAudioSafely]);

  const inactivityCounter = useRef(0);

  const processAgentTurn = useCallback(async (
    currentConversation: ConversationTurn[],
    userInputText: string,
  ) => {
    const startTime = performance.now();
    console.log(`VoiceAgent: Starting agent turn processing at ${new Date().toISOString()}`);
    
    if (!selectedProduct || !selectedCohort || !productInfo) return;
    setError(null);
    
    const nextPitchSection =
      currentPitch && shouldAutoContinuePitch(userInputText)
        ? getNextPitchSection(currentConversation, currentPitch)
        : null;

    if (nextPitchSection) {
      inactivityCounter.current = 0;
      const aiTurn: ConversationTurn = {
        id: `ai-${Date.now()}`,
        speaker: 'AI',
        text: nextPitchSection.text,
        timestamp: new Date().toISOString(),
      };
      setConversation(prev => [...prev, aiTurn]);
      if (nextPitchSection.isFinal) {
        setIsAutoEnding(true);
        setTimeout(() => {
          if (callStateRef.current !== 'ENDED' && handleEndInteractionRef.current) {
            handleEndInteractionRef.current();
          }
        }, 500);
      }
      await synthesizeAndPlay(nextPitchSection.text, aiTurn.id);
      return;
    }

    setCallState("PROCESSING");

    if (isOpenSourceVersion) {
      try {
        const replyText = await requestOpenSourceAgentResponse(currentConversation, userInputText, false);
        const aiTurn: ConversationTurn = {
          id: `ai-${Date.now()}`,
          speaker: 'AI',
          text: replyText,
          timestamp: new Date().toISOString(),
        };
        setConversation(prev => [...prev, aiTurn]);
        await synthesizeAndPlay(replyText, aiTurn.id);
      } catch (error) {
        console.error('Open source voice agent failed:', error);
        setError(getErrorMessage(error));
        setCallState('ERROR');
      }
      return;
    }

    const kbContext = getCachedKnowledgeContext();

    try {
      const flowInput: VoiceSalesAgentFlowInput = {
        action: "PROCESS_USER_RESPONSE",
        product: selectedProduct, productDisplayName: productInfo.displayName, brandName: productInfo.brandName,
        salesPlan: selectedSalesPlan, specialPlanConfigurations: selectedSpecialConfig, offer: offerDetails,
        customerCohort: selectedCohort, agentName, userName,
        knowledgeBaseContext: kbContext,
        conversationHistory: currentConversation, currentPitchState: currentPitch,
        currentUserInputText: userInputText,
        inactivityCounter: inactivityCounter.current,
        brandUrl: productInfo.brandUrl,
      };

      const response = await fetch('/api/voice-sales-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flowInput),
      });
      if (!response.ok) {
        throw new Error(`Voice sales agent API failed: ${response.statusText}`);
      }
      const flowResult = await response.json();
      if (flowResult.generatedPitch) setCurrentPitch(flowResult.generatedPitch);

      if (flowResult.errorMessage) {
          throw new Error(flowResult.errorMessage);
      }

      if (!userInputText) {
        inactivityCounter.current += 1;
      } else {
        inactivityCounter.current = 0;
      }

      const aiResponseText = flowResult.currentAiResponseText;
      if (aiResponseText) {
          const aiTurn: ConversationTurn = { id: `ai-${Date.now()}`, speaker: 'AI' as const, text: aiResponseText, timestamp: new Date().toISOString() };
          setConversation(prev => [...prev, aiTurn]);
          if (flowResult.nextExpectedAction === 'INTERACTION_ENDED') {
            setIsAutoEnding(true);
            // Wait a bit to ensure the conversation is fully updated before auto-ending
            setTimeout(() => {
              if (callStateRef.current !== 'ENDED' && handleEndInteractionRef.current) {
                handleEndInteractionRef.current();
              }
            }, 500);
          }
          await synthesizeAndPlay(aiResponseText, aiTurn.id);
      } else {
          setCallState('LISTENING');
      }

    } catch (error: unknown) {
      const baseMessage = getErrorMessage(error);
      const errorMessage = `I'm sorry, a critical system error occurred. Details: ${baseMessage.substring(0, 200)}...`;
      const errorTurn: ConversationTurn = { id: `error-${Date.now()}`, speaker: 'AI', text: errorMessage, timestamp: new Date().toISOString() };
      setConversation(prev => [...prev, errorTurn]);
      setError(baseMessage);
      await synthesizeAndPlay(errorMessage, errorTurn.id);
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    console.log(`VoiceAgent: Agent turn completed in ${duration.toFixed(2)}ms (${currentConversation.length} turns in conversation)`);
  }, [selectedProduct, productInfo, agentName, userName, selectedSalesPlan, selectedSpecialConfig, offerDetails, selectedCohort, currentPitch, productKbFiles, toast, synthesizeAndPlay, isOpenSourceVersion, requestOpenSourceAgentResponse, getCachedKnowledgeContext]);

  processAgentTurnRef.current = processAgentTurn;

  const handleScorePostCall = useCallback(async ({ transcript, audioDataUri, transcriptAccuracy }: { transcript: string; audioDataUri?: string; transcriptAccuracy?: string; }) => {
    if (!transcript || !selectedProduct || transcript.trim().length === 0) {
      console.warn('VoiceAgent: Skipping scoring - no valid transcript provided');
      toast({ variant: 'destructive', title: "Scoring Skipped", description: "No valid transcript available for scoring." });
      return;
    }

    // Ensure transcript has proper format for scoring
    if (!transcript.includes('AGENT (Profile:') || !transcript.includes('USER (Profile:')) {
      console.warn('VoiceAgent: Skipping scoring - transcript format invalid for scoring');
      toast({ variant: 'destructive', title: "Scoring Skipped", description: "Transcript format is not compatible with scoring system." });
      return;
    }

    try {
        const productData = getProductByName(selectedProduct);
        if(!productData) throw new Error("Product details not found for scoring.");

        const productContext = (() => {
          // Check if we have a valid cached context
          const cache = kbContextCacheRef.current;
          const currentFilesHash = productKbFiles.map(f => `${f.id}-${f.name}-${f.product}-${f.category}`).join('|');
          if (cache && 
              cache.filesHash === currentFilesHash && 
              cache.productName === productData.name && 
              cache.cohort === (selectedCohort || '')) {
            return cache.context;
          }
          
          // Generate new context and cache it
          const newContext = buildProductKnowledgeBaseContext(productKbFiles, productData, {
            customerCohort: selectedCohort,
          });
          kbContextCacheRef.current = {
            filesHash: currentFilesHash,
            productName: productData.name,
            cohort: selectedCohort || '',
            context: newContext
          };
          return newContext;
        })();

        const response = await fetch('/api/call-scoring', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            product: selectedProduct,
            agentName,
            audioDataUri,
            transcriptOverride: transcript,
            productContext,
            brandUrl: productData.brandUrl,
          }),
        });
        if (!response.ok) {
          throw new Error(`API request failed: ${response.statusText}`);
        }
        const scoreOutput = await response.json();

        setFinalCallArtifacts(prev => prev
          ? { ...prev, transcript, transcriptAccuracy, audioUri: audioDataUri, score: scoreOutput }
          : { transcript, transcriptAccuracy, audioUri: audioDataUri, score: scoreOutput }
        );

        if (currentActivityId.current) {
          const existingActivity = activities.find(a => a.id === currentActivityId.current);
          if (existingActivity) {
            updateActivity(currentActivityId.current, { ...existingActivity.details, finalScore: scoreOutput });
          }
        }
        toast({ title: "Scoring Complete!", description: "The call has been scored successfully."});
    } catch (error: unknown) {
        toast({ variant: 'destructive', title: "Scoring Failed", description: getErrorMessage(error) });
    }
  }, [selectedProduct, selectedCohort, getProductByName, productKbFiles, agentName, updateActivity, toast, activities]);

  const handleEndInteraction = useCallback(async (status: 'Completed' | 'Completed (Page Unloaded)' = 'Completed') => {
    handleEndInteractionRef.current = handleEndInteraction;

    stopRecording();
    cancelAudio();
    setCallState("PROCESSING");

    const finalConversation = conversation.filter(turn => !turn.isLive);
    let audioDataUri: string | undefined;
    let transcriptAccuracy: string | undefined;

    try {
      const recordingBlob = await stopRecordingGraph();
      if (recordingBlob && recordingBlob.size > 0) {
        audioDataUri = await blobToDataUri(recordingBlob);
      }
    } catch (err) {
      console.warn('VoiceAgent: failed to capture live recording', err);
    }

    if (audioDataUri) {
      setCurrentRecordingDataUri(audioDataUri);
    } else {
      toast({
        variant: 'destructive',
        title: "Recording Unavailable",
        description: "Live call recording could not be captured. Please ensure microphone access is granted and that you're using a supported browser.",
      });
    }

    const fallbackTranscript = finalConversation
      .map(turn => `${mapSpeakerToRole(turn.speaker)} (Profile: ${mapSpeakerToRole(turn.speaker)}): ${turn.text}`)
      .join('\n');

    let transcriptText = fallbackTranscript;

    if (audioDataUri) {
      try {
        const response = await fetch('/api/transcription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioDataUri }),
        });
        if (response.ok) {
          const transcription: TranscriptionOutput = await response.json();
          // Use standard formatting utility
          const diarizedTranscript = formatTranscriptSegments(transcription);
          if (diarizedTranscript) {
            transcriptText = diarizedTranscript;
          }
          transcriptAccuracy = "Completed";
        }
      } catch (err) {
        console.warn('VoiceAgent: transcription failed, using fallback transcript', err);
      }
    }

    setFinalCallArtifacts({ transcript: transcriptText, transcriptAccuracy, audioUri: audioDataUri });

    if (currentActivityId.current) {
        const existingActivity = activities.find(a => a.id === currentActivityId.current);
        if(existingActivity) {
          updateActivity(currentActivityId.current, {
            ...existingActivity.details,
            status,
            fullTranscriptText: transcriptText,
            fullConversation: finalConversation,
            fullCallAudioDataUri: audioDataUri,
            selectedKbIds: productKbFiles.map(f => f.id)
          });
        }
    }

    setCallState("ENDED");

    if (status === 'Completed') {
      // Small delay to ensure all state is settled before scoring
      setTimeout(() => {
        handleScorePostCall({ transcript: transcriptText, audioDataUri, transcriptAccuracy });
      }, 100);
    }
  }, [conversation, stopRecording, cancelAudio, stopRecordingGraph, blobToDataUri, toast, activities, updateActivity, productKbFiles, handleScorePostCall]);


  const handleStartConversation = useCallback(async () => {
    if (!userName.trim() || !agentName.trim() || !selectedProduct || !selectedCohort || !productInfo) {
      toast({ variant: "destructive", title: "Missing Info", description: "Agent Name, Customer Name, Product, and Cohort are required." });
      return;
    }
    if (!canRecordCalls) {
      toast({
        variant: "destructive",
        title: "Recording Required",
        description: "Live call recordings need a browser that supports MediaRecorder (Chrome or Edge) with microphone permissions enabled.",
      });
      return;
    }

    if (productKbFiles.length === 0) {
      toast({title: "No Knowledge Base Files", description: `There are no KB files for '${productInfo.displayName}'. The AI will rely on its general knowledge.`, duration: 6000});
    }

    setLastCallConfig({
      product: selectedProduct,
      cohort: selectedCohort,
      agentName,
      userName,
      salesPlan: selectedSalesPlan,
      specialConfig: selectedSpecialConfig,
      offerDetails,
      voiceId: selectedVoiceId,
    });

    inactivityCounter.current = 0;
    setConversation([]); setCurrentPitch(null); setFinalCallArtifacts(null);
    setCallState("PROCESSING");

    const activityDetails: Partial<VoiceSalesAgentActivityDetails> = {
      input: { product: selectedProduct, customerCohort: selectedCohort, agentName, userName, voiceName: selectedVoiceId, selectedKbIds: productKbFiles.map(f=>f.id) },
      status: 'In Progress',
      origin: isOpenSourceVersion ? 'voice-agent' : undefined,
    };
    const activityId = logActivity({ module: VOICE_SALES_MODULE, product: selectedProduct, details: activityDetails });
    currentActivityId.current = activityId;

    try {
        if (supportsMediaRecorder) {
          await setupRecordingGraph();
        }

        if (isOpenSourceVersion) {
          const introText = await requestOpenSourceAgentResponse([], '', true);
          const aiTurn: ConversationTurn = { id: `ai-${Date.now()}`, speaker: 'AI', text: introText, timestamp: new Date().toISOString() };
          setConversation([aiTurn]);
          await synthesizeAndPlay(introText, aiTurn.id);
          return;
        }

        const kbContext = getCachedKnowledgeContext();

        const flowInput: VoiceSalesAgentFlowInput = {
            action: 'START_CONVERSATION',
            product: selectedProduct, productDisplayName: productInfo.displayName, brandName: productInfo.brandName,
            salesPlan: selectedSalesPlan, specialPlanConfigurations: selectedSpecialConfig, offer: offerDetails,
            customerCohort: selectedCohort, agentName, userName,
            knowledgeBaseContext: kbContext,
            conversationHistory: [], currentPitchState: null,
            brandUrl: productInfo.brandUrl,
        };
        const response = await fetch('/api/voice-sales-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(flowInput),
        });
        if (!response.ok) {
          throw new Error(`Voice sales agent API failed: ${response.statusText}`);
        }
        const pitchResult = await response.json();

        if (pitchResult.errorMessage || !pitchResult.generatedPitch || !pitchResult.currentAiResponseText) {
          throw new Error(pitchResult.errorMessage || "Failed to generate initial pitch.");
        }

        setCurrentPitch(pitchResult.generatedPitch);
        const openingText = pitchResult.currentAiResponseText;
        const aiTurn: ConversationTurn = { id: `ai-${Date.now()}`, speaker: 'AI' as const, text: openingText, timestamp: new Date().toISOString()};
        setConversation([aiTurn]);

        await synthesizeAndPlay(openingText, aiTurn.id);

    } catch (error: unknown) {
        const errorMessage = getErrorMessage(error) || "Failed to start conversation.";
        setError(errorMessage);
        setCallState("ERROR");
        const errorTurn: ConversationTurn = { id: `error-${Date.now()}`, speaker: 'AI', text: errorMessage, timestamp: new Date().toISOString() };
        setConversation(prev => [...prev, errorTurn]);
        if (supportsMediaRecorder) {
          await stopRecordingGraph();
        }
    }
  }, [userName, agentName, selectedProduct, productInfo, selectedCohort, selectedVoiceId, selectedSalesPlan, selectedSpecialConfig, offerDetails, logActivity, toast, productKbFiles, synthesizeAndPlay, supportsMediaRecorder, setupRecordingGraph, stopRecordingGraph, canRecordCalls, isOpenSourceVersion, requestOpenSourceAgentResponse, getCachedKnowledgeContext]);

  const handlePreviewVoice = useCallback(async () => {
      const player = new Audio();
      player.onended = () => setIsVoicePreviewPlaying(false);
      player.onpause = () => setIsVoicePreviewPlaying(false);
      player.onerror = () => {
        toast({variant: 'destructive', title: 'Audio Playback Error'});
        setIsVoicePreviewPlaying(false);
      };

      setIsVoicePreviewPlaying(true);
      try {
        const textToSynthesize = SAMPLE_TEXT.replace(/\bET\b/g, 'E T');
        const result = await synthesizeSpeechOnClient({ text: textToSynthesize, voice: selectedVoiceId });
        player.src = result.audioDataUri;
        const playPromise = player.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((error: unknown) => {
            if (shouldIgnorePlaybackError(error)) {
              return;
            }
            toast({variant: 'destructive', title: 'Audio Playback Error', description: getErrorMessage(error)});
            setIsVoicePreviewPlaying(false);
          });
        }
      } catch (error: unknown) {
          toast({variant: 'destructive', title: 'TTS Error', description: getErrorMessage(error)});
          setIsVoicePreviewPlaying(false);
      }
  }, [selectedVoiceId, toast]);

  const handleReset = useCallback(async () => {
    if (currentActivityId.current && callStateRef.current !== 'CONFIGURING') {
        const finalConversation = Array.isArray(conversation) ? conversation : [];
        const existingActivity = activities.find(a => a.id === currentActivityId.current);
        if(existingActivity) {
          updateActivity(currentActivityId.current, { ...existingActivity.details, status: 'Completed (Reset)', fullTranscriptText: finalConversation.map(t => `${mapSpeakerToRole(t.speaker)}: ${t.text}`).join('\n'), fullConversation: finalConversation });
        }
        toast({ title: 'Interaction Logged', description: 'The previous call was logged before resetting.' });
    }
    
    // Complete cleanup of audio resources
    cancelAudio(); 
    stopRecording();
    if (supportsMediaRecorder) {
      await stopRecordingGraph().catch(() => {});
    }
    
    // Reset all state
    setCallState("CONFIGURING");
    setConversation([]); 
    setCurrentPitch(null); 
    setFinalCallArtifacts(null);
    setError(null); 
    setCurrentTranscription("");
    setCurrentRecordingDataUri(null);
    currentActivityId.current = null;
  }, [cancelAudio, conversation, updateActivity, toast, stopRecording, stopRecordingGraph, supportsMediaRecorder, activities]);

  useEffect(() => {
    if (conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation, currentTranscription]);

  // Handle recording audio buffering state
  useEffect(() => {
    const audioEl = recordingAudioRef.current;
    if (!audioEl || !currentRecordingDataUri) return;

    const handleLoadStart = () => setIsRecordingBuffering(true);
    const handleCanPlay = () => setIsRecordingBuffering(false);
    const handleLoadedData = () => setIsRecordingBuffering(false);
    const handleError = () => {
      setIsRecordingBuffering(false);
      console.error('Recording audio failed to load');
    };

    audioEl.addEventListener('loadstart', handleLoadStart);
    audioEl.addEventListener('canplay', handleCanPlay);
    audioEl.addEventListener('loadeddata', handleLoadedData);
    audioEl.addEventListener('error', handleError);

    return () => {
      audioEl.removeEventListener('loadstart', handleLoadStart);
      audioEl.removeEventListener('canplay', handleCanPlay);
      audioEl.removeEventListener('loadeddata', handleLoadedData);
      audioEl.removeEventListener('error', handleError);
    };
  }, [currentRecordingDataUri]);

  useEffect(() => {
    const audioEl = audioPlayerRef.current;
    const playNextInQueue = () => {
        if (audioQueueRef.current.length > 0) {
            const nextSrc = audioQueueRef.current.shift()!;
            audioEl!.pause();
            audioEl!.src = nextSrc;
            audioEl!.currentTime = 0;
            playAudioSafely(audioEl!, (e) => {
                console.error("Audio playback error in queue:", e);
                setCallState("LISTENING");
            });
        } else {
            setCurrentlyPlayingId(null);
            setCurrentWordIndex(-1);
            if (isAutoEnding) {
                if (handleEndInteractionRef.current) {
                  handleEndInteractionRef.current();
                }
                setIsAutoEnding(false);
            } else if (callStateRef.current === "AI_SPEAKING") {
                setCallState('LISTENING');
            }
        }
    };

    const onTimeUpdate = () => {
      if (!audioEl || audioEl.paused || !currentlyPlayingId) return;
      if (!isFinite(audioEl.duration) || audioEl.duration <= 0) return;

      const turn = conversation.find(t => t.id === currentlyPlayingId);
      if (!turn) return;

      const totalWords = turn.text.trim().split(/\s+/).filter(Boolean).length;
      if (totalWords === 0) return;

      const progressRatio = Math.min(Math.max(audioEl.currentTime / audioEl.duration, 0), 1);
      const computedIndex = Math.floor(progressRatio * (totalWords - 1));
      setCurrentWordIndex(prev => (prev === computedIndex ? prev : computedIndex));
    };

    if (audioEl) {
        audioEl.addEventListener('ended', playNextInQueue);
        audioEl.addEventListener('timeupdate', onTimeUpdate);
    }
    return () => {
      if(audioEl) {
        audioEl.removeEventListener('ended', playNextInQueue);
        audioEl.removeEventListener('timeupdate', onTimeUpdate);
      }
    };
  }, [conversation, currentlyPlayingId, isAutoEnding, playAudioSafely]);

  useEffect(() => {
    if (callState === 'LISTENING' && !isRecording) {
        startRecording();
    } else if (callState !== 'LISTENING' && isRecording) {
        stopRecording();
    }
  }, [callState, isRecording, startRecording, stopRecording]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (isCallInProgress && currentActivityId.current && handleEndInteractionRef.current) {
            handleEndInteractionRef.current('Completed (Page Unloaded)');
        }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isCallInProgress]);


  const getCallStatusBadge = () => {
    switch (callState) {
        case "LISTENING": return <Badge variant="default" className="text-xs bg-green-100 text-green-800"><Mic className="mr-1.5 h-3.5 w-3.5"/>Listening...</Badge>;
        case "AI_SPEAKING": return <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800"><Bot className="mr-1.5 h-3.5 w-3.5"/>AI Speaking (Interruptible)</Badge>;
        case "PROCESSING": return <Badge variant="secondary" className="text-xs"><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/>Processing...</Badge>;
        case "ENDED": return <Badge variant="secondary" className="text-xs bg-gray-200 text-gray-600"><PhoneOff className="mr-1.5 h-3.5 w-3.5"/>Interaction Ended</Badge>;
        case "ERROR": return <Badge variant="destructive" className="text-xs"><AlertTriangle className="mr-1.5 h-3.5 w-3.5"/>Error</Badge>;
        default: return <Badge variant="outline" className="text-xs">Idle</Badge>;
    }
  }

  const availableCohorts = useMemo(() => productInfo?.customerCohorts || [], [productInfo]);
  const availableSalesPlans = useMemo(() => productInfo?.salesPlans || [], [productInfo]);
  const availableSpecialConfigs = useMemo(() => productInfo?.specialPlanConfigurations || [], [productInfo]);

  useEffect(() => {
    if (productInfo && availableCohorts.length > 0 && !availableCohorts.includes(selectedCohort || '')) {
      setSelectedCohort(availableCohorts[0]);
    }
  }, [productInfo, availableCohorts, selectedCohort]);

  return (
    <>
    <audio ref={audioPlayerRef} className="hidden" />
    <div className="flex flex-col h-full">
      <PageHeader title="AI Voice Sales Agent" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="text-xl flex items-center"><Radio className="mr-2 h-6 w-6 text-primary"/> Configure AI Voice Call</CardTitle>
            <CardDescription>Set up agent, customer, product, and voice profile details before starting the call. The entire Knowledge Base for the selected product will be used as context.</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible defaultValue={callState === 'CONFIGURING' ? "item-config" : ""} className="w-full">
                <AccordionItem value="item-config">
                    <AccordionTrigger className="text-md font-semibold hover:no-underline py-2 text-foreground/90 [&[data-state=open]>&svg]:rotate-180">
                        <div className="flex items-center"><Settings className="mr-2 h-4 w-4 text-accent"/>Call Configuration</div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-3 space-y-4">
                         {isOpenSourceVersion && (
                          <Alert>
                            <AlertTitle>Open Source mode</AlertTitle>
                            <AlertDescription>
                              Calls use local services (Ollama + Coqui). Make sure those servers are running before you start a conversation.
                            </AlertDescription>
                          </Alert>
                         )}
                         {!canRecordCalls && (
                          <Alert variant="destructive">
                            <AlertTitle>Recording Unavailable</AlertTitle>
                            <AlertDescription>
                              Full-call recordings require a browser with MediaRecorder support (Chrome or Edge) and granted microphone access.
                              Please switch browsers or update permissions before starting the call.
                            </AlertDescription>
                          </Alert>
                         )}
                         <div className="space-y-1">
                             <Label>AI Voice Profile (Agent)</Label>
                              <div className="mt-2 flex items-center gap-2">
                                <Select value={selectedVoiceId} onValueChange={setSelectedVoiceId} disabled={isCallInProgress}>
                                    <SelectTrigger className="grow"><SelectValue placeholder={"Select a voice"} /></SelectTrigger>
                                    <SelectContent>{GOOGLE_PRESET_VOICES.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                                </Select>
                                <Button variant="outline" size="sm" onClick={handlePreviewVoice} disabled={isVoicePreviewPlaying || isCallInProgress}>
                                  {isVoicePreviewPlaying ? <Loader2 className="h-4 w-4 animate-spin"/> : <PlayCircle className="h-4 w-4"/>}
                                </Button>
                            </div>
                         </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div className="space-y-1">
                                <Label htmlFor="product-select">Product <span className="text-destructive">*</span></Label>
                                <Select value={selectedProduct} onValueChange={(value) => setSelectedProduct(value)} disabled={isCallInProgress}>
                                    <SelectTrigger id="product-select"><SelectValue placeholder="Select a Product" /></SelectTrigger>
                                    <SelectContent>{availableProducts.map((p) => (<SelectItem key={p.name} value={p.name}>{p.displayName}</SelectItem>))}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="cohort-select">Customer Cohort <span className="text-destructive">*</span></Label>
                                <Select value={selectedCohort} onValueChange={(value) => setSelectedCohort(value)} disabled={isCallInProgress || !productInfo || availableCohorts.length === 0}>
                                    <SelectTrigger id="cohort-select"><SelectValue placeholder="Select Cohort" /></SelectTrigger>
                                    <SelectContent>{availableCohorts.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1"><Label htmlFor="agent-name">Agent Name <span className="text-destructive">*</span></Label><Input id="agent-name" placeholder="e.g., Samantha" value={agentName} onChange={e => setAgentName(e.target.value)} disabled={isCallInProgress} /></div>
                            <div className="space-y-1"><Label htmlFor="user-name">Customer Name <span className="text-destructive">*</span></Label><Input id="user-name" placeholder="e.g., Rohan" value={userName} onChange={e => setUserName(e.target.value)} disabled={isCallInProgress} /></div>
                        </div>
                          {isClient && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {availableSpecialConfigs.length > 0 && (<div className="space-y-1">
                                  <Label htmlFor="special-plan-config-select">Special Plan Configuration (Optional)</Label>
                                  <Select value={selectedSpecialConfig} onValueChange={(value) => setSelectedSpecialConfig(value)} disabled={isCallInProgress}>
                                      <SelectTrigger id="special-plan-config-select"><SelectValue placeholder="Select special config" /></SelectTrigger>
                                      <SelectContent>{availableSpecialConfigs.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                                  </Select>
                              </div>)}
                              {availableSalesPlans.length > 0 && (
                                <div className="space-y-1">
                                      <Label htmlFor="plan-select">Sales Plan (Optional)</Label>
                                      <Select value={selectedSalesPlan} onValueChange={(value) => setSelectedSalesPlan(value)} disabled={isCallInProgress}>
                                          <SelectTrigger id="plan-select"><SelectValue placeholder="Select Sales Plan" /></SelectTrigger>
                                          <SelectContent>{availableSalesPlans.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                                      </Select>
                                  </div>
                              )}
                              <div className="space-y-1"><Label htmlFor="offer-details">Offer Details (Optional)</Label><Input id="offer-details" placeholder="e.g., 20% off" value={offerDetails} onChange={e => setOfferDetails(e.target.value)} disabled={isCallInProgress} /></div>
                          </div>
                          )}
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
            {callState === 'CONFIGURING' && (
                 <Button onClick={handleStartConversation} disabled={!selectedProduct || !selectedCohort || !userName.trim() || !agentName.trim() || !canRecordCalls} className="w-full mt-4">
                    <PhoneCall className="mr-2 h-4 w-4"/> Start Voice Call
                </Button>
            )}
          </CardContent>
        </Card>
        {callState !== 'CONFIGURING' && callState !== 'IDLE' && (
          <Card className="w-full max-w-4xl mx-auto mt-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <div className="flex items-center"><SquareTerminal className="mr-2 h-5 w-5 text-primary"/> Conversation Log</div>
                {getCallStatusBadge()}
              </CardTitle>
              <CardDescription>Interaction with {userName || "Customer"}. Agent: {agentName || "Default AI"}. Product: {productInfo?.displayName}.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] w-full border rounded-md p-3 bg-muted/20 mb-3">
                {(() => {
                  const hasLiveTurn = conversation.some(turn => turn.isLive);
                  if (hasLiveTurn) {
                    return null;
                  }
                  if (callState === "LISTENING" && !currentTranscription.trim()) {
                    return (
                      <div className="flex items-start gap-2.5 my-3 justify-end user-line opacity-80">
                        <div className="flex flex-col gap-1 w-full max-w-[80%] items-end">
                          <Card className="max-w-full w-fit p-3 rounded-xl shadow-xs bg-accent/40 text-accent-foreground rounded-br-none animate-pulse">
                            <CardContent className="p-0 text-sm">
                              <p className="italic">Listening...</p>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
                {conversation.map((turn) => <ConversationTurnComponent
                    key={turn.id}
                    turn={turn}
                    onPlayAudio={handleTurnAudioPlayback}
                    currentlyPlayingId={currentlyPlayingId}
                    wordIndex={turn.id === currentlyPlayingId ? currentWordIndex : -1}
                />)}
                {callState === "PROCESSING" && <LoadingSpinner size={16} className="mx-auto my-2" />}
                <div ref={conversationEndRef} />
              </ScrollArea>

              {currentRecordingDataUri && (
                <div className="mb-3 p-3 border rounded-md bg-muted/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Mic className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Live Call Recording</span>
                    {isRecordingBuffering && (
                      <Badge variant="secondary" className="text-xs">
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Buffering...
                      </Badge>
                    )}
                  </div>
                  <audio
                    ref={recordingAudioRef}
                    controls
                    className="w-full"
                    src={currentRecordingDataUri}
                    preload="auto"
                  />
                  <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      {isRecordingBuffering 
                        ? "Loading full recording for seeking..."
                        : "Full call recording - seek, rewind, or fast-forward instantly."
                      }
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full sm:w-auto justify-center gap-2"
                      onClick={() => void downloadDataUriFile(
                        currentRecordingDataUri,
                        `VoiceSales_${userName || 'Customer'}.webm`
                      )}
                    >
                      <FileAudio className="h-4 w-4" />
                      Download
                    </Button>
                  </div>
                </div>
              )}

               {error && (<Alert variant="destructive" className="mb-3"><Accordion type="single" collapsible><AccordionItem value="item-1" className="border-b-0"><AccordionTrigger className="p-0 hover:no-underline text-sm font-semibold [&_svg]:ml-1"><div className="flex items-center"><AlertTriangle className="h-4 w-4 mr-2" /> An error occurred. Click to see details.</div></AccordionTrigger><AccordionContent className="pt-2 text-xs"><pre className="whitespace-pre-wrap break-all bg-destructive/10 p-2 rounded-md font-mono">{error}</pre></AccordionContent></AccordionItem></Accordion></Alert>)}
            </CardContent>
            <CardFooter className="flex justify-between items-center">
                 <Button onClick={() => handleEndInteraction()} variant="destructive" size="sm" disabled={callState === "ENDED"}>
                   <PhoneOff className="mr-2 h-4 w-4"/> End Interaction
                </Button>
                 <div className="flex gap-2">
                   {lastCallConfig && callState === "ENDED" && (
                     <Button 
                       onClick={() => {
                         // Restore previous call config
                         setSelectedProduct(lastCallConfig.product);
                         setSelectedCohort(lastCallConfig.cohort);
                         setAgentName(lastCallConfig.agentName);
                         setUserName(lastCallConfig.userName);
                         setSelectedSalesPlan(lastCallConfig.salesPlan);
                         setSelectedSpecialConfig(lastCallConfig.specialConfig);
                         setOfferDetails(lastCallConfig.offerDetails);
                         setSelectedVoiceId(lastCallConfig.voiceId);
                         // Reset state and start new call
                         handleReset().then(() => {
                           toast({ title: 'Redial Ready', description: 'Previous call settings restored. Click "Start Voice Call" to begin.' });
                         });
                       }} 
                       variant="outline" 
                       size="sm"
                     >
                       <Redo className="mr-2 h-4 w-4"/> Redial Same Call
                     </Button>
                   )}
                   <Button onClick={handleReset} variant="outline" size="sm" disabled={callState !== "ENDED"}>
                      <PhoneCall className="mr-2 h-4 w-4"/> New Call
                  </Button>
                 </div>
            </CardFooter>
          </Card>
        )}
        {finalCallArtifacts && callState === 'ENDED' && (
           <PostCallReview
              artifacts={finalCallArtifacts}
              agentName={agentName}
              userName={userName}
              product={selectedProduct as Product}
           />
        )}
      </main>
    </div>
    </>
  );
}
