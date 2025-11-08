import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Copy, CheckCircle2, Save } from 'lucide-react';
import SaveTemplateModal from './SaveTemplateModal';

interface JobDetailsModalProps {
  open: boolean;
  onClose: () => void;
  job: {
    id: number;
    job_id: string;
    job_name: string;
    status: string;
    queued_at: string;
    started_at: string | null;
    completed_at: string | null;
    execution_type: string;
    exit_code: number | null;
    reason: string | null;
    stdout?: string | null;
    stderr?: string | null;
    job_document?: any;
    template_id?: number;
    target_type?: string;
    target_devices?: string[];
  } | null;
}

export const JobDetailsModal: React.FC<JobDetailsModalProps> = ({ open, onClose, job }) => {
  const [copiedStdout, setCopiedStdout] = useState(false);
  const [copiedStderr, setCopiedStderr] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);

  if (!job) return null;

  const copyToClipboard = async (text: string, type: 'stdout' | 'stderr') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'stdout') {
        setCopiedStdout(true);
        setTimeout(() => setCopiedStdout(false), 2000);
      } else {
        setCopiedStderr(true);
        setTimeout(() => setCopiedStderr(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      QUEUED: { color: 'bg-gray-100 text-gray-700 border-gray-300', label: 'Queued' },
      IN_PROGRESS: { color: 'bg-blue-100 text-blue-700 border-blue-300', label: 'In Progress' },
      SUCCEEDED: { color: 'bg-green-100 text-green-700 border-green-300', label: 'Succeeded' },
      FAILED: { color: 'bg-red-100 text-red-700 border-red-300', label: 'Failed' },
      TIMED_OUT: { color: 'bg-orange-100 text-orange-700 border-orange-300', label: 'Timed Out' },
      CANCELED: { color: 'bg-gray-100 text-gray-600 border-gray-300', label: 'Canceled' },
      REJECTED: { color: 'bg-red-100 text-red-600 border-red-300', label: 'Rejected' },
    };

    const config = statusConfig[status] || statusConfig.QUEUED;

    return (
      <Badge variant="outline" className={`${config.color} text-xs px-2 py-0.5`}>
        {config.label}
      </Badge>
    );
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  // Format JSON with syntax highlighting
  const formatJsonWithSyntaxHighlight = (obj: any) => {
    const formatted = JSON.stringify(obj, null, 2);
    
    return formatted
      .replace(/(".*?"):/g, '<span class="text-blue-400 font-medium">$1</span>:')  // Keys
      .replace(/: (".*?")/g, ': <span class="text-green-400">$1</span>')  // String values
      .replace(/: (true|false)/g, ': <span class="text-purple-400 font-semibold">$1</span>')  // Booleans
      .replace(/: (null)/g, ': <span class="text-gray-500 italic">$1</span>')  // Null
      .replace(/: (-?\d+\.?\d*)/g, ': <span class="text-orange-400">$1</span>');  // Numbers
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Job Details: {job.job_name}
            {getStatusBadge(job.status)}
            <Badge variant="outline" className="text-xs bg-muted text-foreground border-border capitalize">
              {job.execution_type}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Job ID</label>
              <p className="text-sm text-foreground font-mono truncate">{job.job_id}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Template ID</label>
              <p className="text-sm text-foreground">{job.template_id || 'N/A'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Execution Type</label>
              <p className="text-sm text-foreground capitalize">{job.execution_type}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Exit Code</label>
              <p className="text-sm text-foreground">{job.exit_code !== null ? job.exit_code : 'N/A'}</p>
            </div>
          </div>

          {/* Timestamps */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold text-foreground mb-3">Timeline</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Queued At:</span>
                <span className="text-sm text-foreground">{formatDate(job.queued_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Started At:</span>
                <span className="text-sm text-foreground">{formatDate(job.started_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Completed At:</span>
                <span className="text-sm text-foreground">{formatDate(job.completed_at)}</span>
              </div>
            </div>
          </div>

          {/* Target Devices */}
          {job.target_devices && job.target_devices.length > 0 && (
            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Target Devices</h4>
              <div className="bg-accent rounded p-2">
                {job.target_devices.map((deviceId, index) => (
                  <p key={index} className="text-xs font-mono text-foreground">{deviceId}</p>
                ))}
              </div>
            </div>
          )}

          {/* Reason (if failed) */}
          {job.reason && (
            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Reason</h4>
              <div className="bg-destructive/10 border border-destructive/20 rounded p-3">
                <p className="text-sm text-destructive">{job.reason}</p>
              </div>
            </div>
          )}

          {/* Tabbed Interface for Job Steps and Output */}
          {(job.job_document || job.stdout || job.stderr) && (
            <div className="border-t pt-4">
              <Tabs defaultValue="steps" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="steps" className="flex-1">Job Steps</TabsTrigger>
                  <TabsTrigger value="output" className="flex-1">Execution Output</TabsTrigger>
                </TabsList>

                {/* Job Steps Tab */}
                <TabsContent value="steps" className="mt-4">
                  {job.job_document ? (
                    <>
                      {/* Check if job_document has steps */}
                      {job.job_document.steps && job.job_document.steps.length > 0 ? (
                        <div className="space-y-3">
                          {job.job_document.steps.map((step: any, index: number) => (
                            <div key={index} className="bg-accent border border-border rounded-lg p-4">
                              <div className="flex items-start gap-3">
                                {/* Step Number */}
                                <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-semibold">
                                  {index + 1}
                                </div>
                                
                                {/* Step Details */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h5 className="text-sm font-semibold text-foreground">{step.name}</h5>
                                    <Badge variant="outline" className="text-xs">
                                      {step.type}
                                    </Badge>
                                  </div>
                                  
                                  {/* Command or Input */}
                                  {step.input && (
                                    <div className="mt-2">
                                      {step.input.command && (
                                        <div className="bg-muted rounded px-3 py-2">
                                          <p className="text-xs text-muted-foreground font-mono">
                                            {typeof step.input.command === 'string' 
                                              ? step.input.command 
                                              : Array.isArray(step.input.command) 
                                                ? step.input.command.join(' ') 
                                                : JSON.stringify(step.input.command)}
                                          </p>
                                        </div>
                                      )}
                                      
                                      {/* Other input properties */}
                                      {Object.keys(step.input).filter(key => key !== 'command').length > 0 && (
                                        <div className="mt-2 space-y-1">
                                          {Object.entries(step.input)
                                            .filter(([key]) => key !== 'command')
                                            .map(([key, value]) => (
                                              <div key={key} className="flex gap-2 text-xs">
                                                <span className="text-muted-foreground font-medium capitalize">{key}:</span>
                                                <span className="text-foreground">{String(value)}</span>
                                              </div>
                                            ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  {/* Run as user */}
                                  {step.runAsUser && (
                                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                                      <span className="font-medium">Run as:</span>
                                      <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{step.runAsUser}</span>
                                    </div>
                                  )}
                                  
                                  {/* Timeout */}
                                  {step.timeoutSeconds && (
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      Timeout: {step.timeoutSeconds}s
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-accent rounded p-4">
                          <p className="text-sm text-muted-foreground">No steps defined</p>
                        </div>
                      )}
                      
          
                    </>
                  ) : (
                    <div className="bg-accent rounded p-4">
                      <p className="text-sm text-muted-foreground">No job document available</p>
                    </div>
                  )}
                </TabsContent>

                {/* Execution Output Tab */}
                <TabsContent value="output" className="mt-4">
                  {(job.stdout || job.stderr) ? (
                    <>
                      {/* Standard Output (stdout) */}
                      {job.stdout && (
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-foreground flex items-center gap-2">
                              <span className="bg-accent px-2 py-0.5 rounded text-xs font-mono">stdout</span>
                              Standard Output
                            </label>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(job.stdout!, 'stdout')}
                              className="h-7 text-xs"
                            >
                              {copiedStdout ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 mr-1" />
                                  Copy
                                </>
                              )}
                            </Button>
                          </div>
                          <div className="bg-muted rounded-lg p-4 overflow-x-auto max-h-[300px] overflow-y-auto border border-border">
                            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
                              {job.stdout}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Standard Error (stderr) */}
                      {job.stderr && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-destructive flex items-center gap-2">
                              <span className="bg-destructive/10 px-2 py-0.5 rounded text-xs font-mono">stderr</span>
                              Error Output
                            </label>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(job.stderr!, 'stderr')}
                              className="h-7 text-xs"
                            >
                              {copiedStderr ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 mr-1" />
                                  Copy
                                </>
                              )}
                            </Button>
                          </div>
                          <div className="bg-muted rounded-lg p-4 overflow-x-auto max-h-[300px] overflow-y-auto border border-border">
                            <pre className="text-xs font-mono text-destructive whitespace-pre-wrap">
                              {job.stderr}
                            </pre>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="bg-accent rounded p-4">
                      <p className="text-sm text-muted-foreground">No execution output available</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          {job.job_document && (
            <Button
              variant="outline"
              onClick={() => setShowSaveTemplateModal(true)}
            >
              <Save className="w-4 h-4 mr-2" />
              Save as Template
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Save Template Modal */}
        <SaveTemplateModal
          open={showSaveTemplateModal}
          onClose={() => setShowSaveTemplateModal(false)}
          jobDocument={job.job_document}
          onSaved={() => {
            setShowSaveTemplateModal(false);
            // Optionally show success message
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

export default JobDetailsModal;
