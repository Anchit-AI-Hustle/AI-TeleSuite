
"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User, Bot, Music, PauseCircle, Phone, Info } from 'lucide-react';
import '@/styles/transcript.css';

type SpeakerType = 'AGENT' | 'USER' | 'SYSTEM' | 'EVENT';
interface TranscriptSegment {
  timestamp: string | null;
  speaker: SpeakerType;
  profile?: string;
  text: string;
  eventTag?: string;
}

const EVENT_TAGS = [
  'PRECALL_ANSWER',
  'RINGING',
  'MUSIC',
  'HOLD_TONE',
  'HOLD',
  'IVR_PROMPT',
  'IVR_MENU',
  'IVR',
  'SILENCE',
  'CALL_TRANSFER',
  'BACKGROUND_NOISE',
  'SYSTEM',
  'SYSTEM_EVENT',
  'SYSTEM_MESSAGE',
  'ANNOUNCEMENT',
] as const;

const normalizeEventTag = (tag: string): string => {
  const upper = tag.toUpperCase().replace(/\s+/g, '_');
  const match = EVENT_TAGS.find(eventTag => upper.startsWith(eventTag));
  return match ?? upper;
};

const parseTranscript = (transcript: string): TranscriptSegment[] => {
  const lines = typeof transcript === 'string'
    ? transcript.split('\n').map(line => line.trim()).filter(Boolean)
    : [];

  if (lines.length === 0) {
    return [];
  }

  const segments: TranscriptSegment[] = [];
  let currentTimestamp: string | null = null;
  let currentGroup: TranscriptSegment | null = null;

  const flushCurrentGroup = () => {
    if (currentGroup) {
      segments.push(currentGroup);
      currentGroup = null;
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    // Combined [timestamp] SPEAKER format on one line
    const combinedSpeakerMatch = line.match(/^\[(.*?)\]\s*(AGENT|USER|SYSTEM)\s*(?:\(([^)]*?)\))?\s*:\s*(.*)$/i);
    if (combinedSpeakerMatch) {
      flushCurrentGroup();
      const [, timestamp, speakerRaw, profileRaw, contentRaw] = combinedSpeakerMatch;
      currentTimestamp = timestamp.trim() || null;
      currentGroup = {
        timestamp: currentTimestamp,
        speaker: speakerRaw.toUpperCase() as SpeakerType,
        profile: profileRaw?.trim(),
        text: contentRaw.trim(),
      };
      return;
    }

    // Combined [timestamp] [EVENT] format on one line
    const combinedEventMatch = line.match(/^\[(.*?)\]\s*\[(.+?)\](.*)$/);
    if (combinedEventMatch) {
      const [, timestamp, tagRaw, remainder] = combinedEventMatch;
      flushCurrentGroup();
      currentTimestamp = timestamp.trim() || null;
      const normalizedTag = normalizeEventTag(tagRaw);
      const recognizedTag = EVENT_TAGS.includes(
        normalizedTag as (typeof EVENT_TAGS)[number]
      );
      const description = remainder.trim().replace(/^-\s*/, '');
      segments.push({
        timestamp: currentTimestamp,
        speaker: 'EVENT',
        eventTag: recognizedTag ? normalizedTag : undefined,
        text: recognizedTag && description
          ? description
          : `[${tagRaw.trim()}]${description ? ` ${description}` : ''}`,
      });
      return;
    }

    // Timestamp only line
    const timestampOnlyMatch = line.match(/^\[(.*?)\]\s*$/);
    if (timestampOnlyMatch) {
      flushCurrentGroup();
      currentTimestamp = timestampOnlyMatch[1].trim() || null;
      return;
    }

    // Speaker line without timestamp
    const speakerMatch = line.match(/^(AGENT|USER|SYSTEM)\s*(?:\(([^)]*?)\))?\s*:\s*(.*)$/i);
    if (speakerMatch) {
      flushCurrentGroup();
      const [, speakerRaw, profileRaw, contentRaw] = speakerMatch;
      currentGroup = {
        timestamp: currentTimestamp,
        speaker: speakerRaw.toUpperCase() as SpeakerType,
        profile: profileRaw?.trim(),
        text: contentRaw.trim(),
      };
      return;
    }

    // Event line without timestamp
    const eventMatch = line.match(/^\[(.+?)\](.*)$/);
    if (eventMatch) {
      flushCurrentGroup();
      const [, tagRaw, remainder] = eventMatch;
      const normalizedTag = normalizeEventTag(tagRaw);
      const recognizedTag = EVENT_TAGS.includes(
        normalizedTag as (typeof EVENT_TAGS)[number]
      );
      const description = remainder.trim().replace(/^-\s*/, '');
      segments.push({
        timestamp: currentTimestamp,
        speaker: 'EVENT',
        eventTag: recognizedTag ? normalizedTag : undefined,
        text: recognizedTag && description
          ? description
          : `[${tagRaw.trim()}]${description ? ` ${description}` : ''}`,
      });
      return;
    }

    // Continuation lines for current speaker
    if (currentGroup && currentGroup.speaker !== 'EVENT') {
      currentGroup.text += `\n${line}`;
      return;
    }

    // Fallback: treat as system/event note
    segments.push({
      timestamp: currentTimestamp,
      speaker: 'EVENT',
      text: line,
    });
  });

  flushCurrentGroup();
  return segments;
};

const getEventIcon = (tag?: string) => {
  if (!tag) return <Info size={14} />;
  const normalized = tag.toUpperCase();
  if (normalized.includes('PRECALL')) return <Phone size={14} />;
  if (normalized.includes('RINGING') || normalized.includes('CALL')) return <Phone size={14} />;
  if (normalized.includes('MUSIC') || normalized.includes('HOLD')) return <Music size={14} />;
  if (normalized.includes('SILENCE')) return <PauseCircle size={14} />;
  if (normalized.includes('IVR')) return <Bot size={14} />;
  if (normalized.includes('BACKGROUND')) return <Info size={14} />;
  return <Info size={14} />;
};

export const TranscriptDisplay = ({ transcript }: { transcript: string }) => {
  const segments = parseTranscript(transcript);

  if (segments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic p-4 text-center">
        Transcript not available or is empty.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {segments.map((segment, index) => {
        if (segment.speaker === 'EVENT') {
          return (
            <div key={index} className="event-line">
              {getEventIcon(segment.eventTag ?? segment.text)}
              <span className="text-xs font-mono">
                {segment.timestamp ? `[${segment.timestamp}] ` : ''}
                {segment.eventTag ? `[${segment.eventTag}]` : ''}
                {segment.eventTag && segment.text ? ' ' : ''}
                {segment.text}
              </span>
            </div>
          );
        }

        const isAgent = segment.speaker === 'AGENT';
        const isSystem = segment.speaker === 'SYSTEM';
        const speakerLabel = isAgent ? 'Agent' : isSystem ? 'System' : 'Customer';

        return (
          <div
            key={index}
            className={cn(
              'flex items-start gap-3',
              isAgent ? 'agent-line' : isSystem ? 'system-line' : 'user-line'
            )}
          >
            {(isAgent || isSystem) && (
              <Avatar className="h-9 w-9 shrink-0 border-2 shadow-xs">
                <AvatarFallback className={cn(
                  isAgent 
                    ? "bg-linear-to-br/srgb from-blue-500 to-blue-600 text-white font-semibold" 
                    : "bg-linear-to-br/srgb from-gray-400 to-gray-500 text-white"
                )}>
                  {isAgent ? <Bot size={20} /> : <Info size={20} />}
                </AvatarFallback>
              </Avatar>
            )}

            <div
              className={cn(
                'flex flex-col gap-1.5 max-w-[75%]',
                isAgent || isSystem ? '' : 'items-end'
              )}
            >
              {segment.timestamp && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono px-1">
                  {segment.timestamp}
                </span>
              )}
              <div
                className={cn(
                  'p-4 rounded-2xl shadow-md text-sm whitespace-pre-wrap wrap-break-word leading-relaxed transition-all hover:shadow-lg',
                  isAgent
                    ? 'bg-linear-to-br/srgb from-blue-50 to-blue-100 border-2 border-blue-200 text-blue-900'
                    : isSystem
                    ? 'bg-linear-to-br/srgb from-gray-50 to-gray-100 border-2 border-gray-200 text-gray-700'
                    : 'bg-linear-to-br/srgb from-green-50 to-green-100 border-2 border-green-200 text-green-900'
                )}
              >
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-current/10">
                  <p className="text-xs font-bold uppercase tracking-wider">
                    {speakerLabel}
                  </p>
                  {segment.profile && (
                    <span className={cn(
                      "text-xs font-semibold px-2 py-0.5 rounded-full",
                      isAgent 
                        ? "bg-blue-200 text-blue-800"
                        : isSystem
                        ? "bg-gray-200 text-gray-700"
                        : "bg-green-200 text-green-800"
                    )}>
                      {segment.profile}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed">{segment.text}</p>
              </div>
            </div>

            {!isAgent && !isSystem && (
              <Avatar className="h-9 w-9 shrink-0 border-2 shadow-xs">
                <AvatarFallback className="bg-linear-to-br/srgb from-green-500 to-green-600 text-white font-semibold">
                  <User size={20} />
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        );
      })}
    </div>
  );
};
