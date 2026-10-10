/**
 * @fileOverview Universal transcript viewer component for AI-TeleSuite
 * 
 * This is THE ONLY transcript renderer in the entire application.
 * All transcript displays MUST use this component for consistency.
 * 
 * Features:
 * - First-speaker-based alignment logic (no hardcoded left/right by role)
 * - CSS variable theming (see src/styles/transcript.css)
 * - ROLE-BASED colors (agent=indigo, user=slate) that never flip
 * - Clean chat bubble UI with timestamps
 * - No "Unknown" name injection (uses role-based defaults)
 * - Handles SYSTEM events with distinct styling
 * 
 * Design Philosophy:
 * - Alignment (left/right) determined by first speaker
 * - Colors determined ONLY by role (AGENT/USER), never by position
 * - Clean, modern chat interface
 * - Accessible with ARIA labels
 * - Responsive layout
 */

"use client";

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bot, User, Info } from 'lucide-react';
import type { TranscriptDoc, SpeakerRole } from '@/types/transcript';
import { getSpeakerDisplayName, formatTimestamp } from '@/types/transcript';

interface TranscriptViewerProps {
  /** The canonical transcript document to display */
  transcript: TranscriptDoc;
  
  /**
   * Optional: Force agent position to 'left' or 'right'
   * If not specified, uses first-speaker logic:
   * - First speaker (usually AGENT) aligns left
   * - Other speakers align right
   */
  agentPosition?: 'left' | 'right';
  
  /** Optional: Show timestamps for each turn */
  showTimestamps?: boolean;
  
  /** Optional: Custom CSS class for container */
  className?: string;
  
  /** Optional: Highlight a specific turn by index */
  highlightTurnIndex?: number;
}

/**
 * TranscriptViewer - Universal transcript renderer
 * 
 * This component is the ONLY way to display transcripts in AI-TeleSuite.
 * Use it everywhere: transcription pages, voice agents, analytics, exports.
 */
export function TranscriptViewer({
  transcript,
  agentPosition,
  showTimestamps = true,
  className,
  highlightTurnIndex,
}: TranscriptViewerProps) {
  
  // Determine alignment logic based on first speaker
  const alignmentMap = useMemo(() => {
    const map = new Map<SpeakerRole, 'left' | 'right'>();
    
    if (agentPosition) {
      // Explicit positioning
      map.set('AGENT', agentPosition);
      map.set('USER', agentPosition === 'left' ? 'right' : 'left');
      map.set('SYSTEM', 'left'); // SYSTEM always left
    } else {
      // First-speaker logic
      const firstSpeaker = transcript.turns.find(t => t.speaker !== 'SYSTEM')?.speaker;
      
      if (firstSpeaker === 'AGENT') {
        map.set('AGENT', 'left');
        map.set('USER', 'right');
      } else {
        map.set('USER', 'left');
        map.set('AGENT', 'right');
      }
      
      map.set('SYSTEM', 'left'); // SYSTEM always left
    }
    
    return map;
  }, [agentPosition, transcript.turns]);
  
  const getAlignment = (speaker: SpeakerRole): 'left' | 'right' => {
    return alignmentMap.get(speaker) || 'left';
  };
  
  if (!transcript || !transcript.turns || transcript.turns.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Info className="mr-2 h-5 w-5" />
        <span>No transcript available</span>
      </div>
    );
  }
  
  return (
    <div className={cn("transcript-viewer space-y-4 p-4", className)}>
      {transcript.turns.map((turn, index) => {
        const alignment = getAlignment(turn.speaker);
        const isHighlighted = highlightTurnIndex === index;
        const displayName = getSpeakerDisplayName(turn);
        
        // SYSTEM turns use special styling
        if (turn.speaker === 'SYSTEM') {
          return (
            <div
              key={index}
              className={cn(
                "flex items-center justify-center gap-2 text-sm text-muted-foreground italic",
                isHighlighted && "ring-2 ring-yellow-400 rounded-md p-2"
              )}
              role="status"
              aria-label={`System event: ${turn.text}`}
            >
              <Info className="h-4 w-4 shrink-0" />
              <span>{turn.text}</span>
              {showTimestamps && (
                <span className="text-xs opacity-70">
                  {formatTimestamp(turn.startS)}
                </span>
              )}
            </div>
          );
        }
        
        // Regular AGENT/USER turns with chat bubbles
        return (
          <div
            key={index}
            className={cn(
              "flex gap-3",
              alignment === 'right' ? "flex-row-reverse" : "flex-row",
              isHighlighted && "bg-yellow-50 dark:bg-yellow-950/20 p-2 rounded-lg"
            )}
            role="article"
            aria-label={`${displayName} said: ${turn.text}`}
          >
            {/* Avatar */}
            <Avatar className="h-8 w-8 shrink-0 mt-1">
              <AvatarFallback
                className={cn(
                  "transcript-avatar-" + (turn.speaker === 'AGENT' ? 'agent' : 'user')
                )}
              >
                {turn.speaker === 'AGENT' ? (
                  <Bot className="h-4 w-4" />
                ) : (
                  <User className="h-4 w-4" />
                )}
              </AvatarFallback>
            </Avatar>
            
            {/* Message bubble */}
            <div
              className={cn(
                "flex flex-col gap-1 max-w-[75%]",
                alignment === 'right' ? "items-end" : "items-start"
              )}
            >
              {/* Speaker name and timestamp */}
              <div
                className={cn(
                  "flex items-center gap-2 text-xs text-muted-foreground px-1",
                  alignment === 'right' ? "flex-row-reverse" : "flex-row"
                )}
              >
                <span className="font-medium">{displayName}</span>
                {showTimestamps && (
                  <span className="transcript-timestamp">
                    {formatTimestamp(turn.startS)}
                  </span>
                )}
              </div>
              
              {/* Message content - Using CSS variables for colors */}
              <div
                className={
                  turn.speaker === 'AGENT'
                    ? "transcript-bubble-agent"
                    : "transcript-bubble-user"
                }
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {turn.text}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      
      {/* Call metadata footer */}
      {transcript.metadata && transcript.metadata.durationS && (
        <div className="flex items-center justify-center gap-4 pt-4 text-xs text-muted-foreground border-t">
          <span>Total Duration: {formatTimestamp(transcript.metadata.durationS)}</span>
          {transcript.metadata.language && (
            <span>Language: {transcript.metadata.language.toUpperCase()}</span>
          )}
          {transcript.turns.length > 0 && (
            <span>{transcript.turns.length} turns</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * CSS Variables for theming (add to globals.css):
 * 
 * .transcript-bubble-agent {
 *   --bubble-bg: theme('colors.blue.500');
 *   --bubble-text: theme('colors.white');
 * }
 * 
 * .transcript-bubble-user {
 *   --bubble-bg: theme('colors.green.500');
 *   --bubble-text: theme('colors.white');
 * }
 */
