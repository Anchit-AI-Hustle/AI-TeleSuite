'use client';

import { memo } from 'react';
import { Clock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export type BatchProgressStatus = 'queued' | 'running' | 'success' | 'failed';

export interface BatchProgressItem {
  id: string;
  fileName: string;
  step: string;
  status: BatchProgressStatus;
  progress: number;
  message?: string;
}

interface BatchProgressListProps {
  items: BatchProgressItem[];
  title?: string;
  description?: string;
  className?: string;
}

const STATUS_CONFIG: Record<
  BatchProgressStatus,
  {
    label: string;
    icon: typeof Clock;
    iconClass: string;
    badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  }
> = {
  queued: {
    label: 'Queued',
    icon: Clock,
    iconClass: 'text-muted-foreground',
    badgeVariant: 'secondary',
  },
  running: {
    label: 'In progress',
    icon: Loader2,
    iconClass: 'text-primary animate-spin',
    badgeVariant: 'outline',
  },
  success: {
    label: 'Completed',
    icon: CheckCircle2,
    iconClass: 'text-emerald-500',
    badgeVariant: 'default',
  },
  failed: {
    label: 'Failed',
    icon: AlertCircle,
    iconClass: 'text-destructive',
    badgeVariant: 'destructive',
  },
};

/**
 * Renders a compact list showing the progress of batch jobs.
 * Designed for file-processing flows where each item reports step, status, and progress.
 */
function BatchProgressListComponent({
  items,
  title = 'Batch Progress',
  description,
  className,
}: BatchProgressListProps) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className={cn('w-full max-w-4xl rounded-lg border bg-card shadow-xs', className)}>
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <ul className="divide-y">
        {items.map((item) => {
          const statusConfig = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.queued;
          const StatusIcon = statusConfig.icon;
          const progressValue = Math.min(Math.max(item.progress ?? 0, 0), 100);

          return (
            <li key={item.id} className="px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <StatusIcon className={cn('mt-0.5 h-4 w-4', statusConfig.iconClass)} />
                <div>
                  <p className="text-sm font-medium text-foreground">{item.fileName}</p>
                  <p className="text-xs text-muted-foreground">{item.step}</p>
                  {item.message && (
                    <p className="mt-1 text-xs text-muted-foreground">{item.message}</p>
                  )}
                </div>
              </div>
              <div className="w-full sm:w-64 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Badge variant={statusConfig.badgeVariant} className="capitalize">
                    {statusConfig.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {progressValue.toFixed(0)}%
                  </span>
                </div>
                <Progress value={progressValue} className="h-2" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const BatchProgressList = memo(BatchProgressListComponent);
