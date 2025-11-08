import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { buildApiUrl } from '@/config/api';

interface JobTemplate {
  id: number;
  name: string;
  description: string;
  category: string;
  job_document?: any;
}

interface JobStep {
  name: string;
  type: 'runCommand' | 'runHandler';
  input: {
    command?: string;
    handler?: string;
    args?: string[];
    path?: string;
  };
  runAsUser?: string;
  allowStdErr?: number;
  ignoreStepFailure?: boolean;
  timeoutSeconds?: number;
}

interface AddJobModalProps {
  open: boolean;
  onClose: () => void;
  deviceUuid: string;
  onJobAdded: () => void;
}

export const AddJobModal: React.FC<AddJobModalProps> = ({
  open,
  onClose,
  deviceUuid,
  onJobAdded,
}) => {
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>('');
  const [executeTime, setExecuteTime] = useState<'now' | 'schedule'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  
  // Template variables state
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [requiredVariables, setRequiredVariables] = useState<string[]>([]);
  
  // Custom steps state
  const [customSteps, setCustomSteps] = useState<JobStep[]>([]);
  const [showStepsEditor, setShowStepsEditor] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  
  // Step editor form state
  const [stepForm, setStepForm] = useState<JobStep>({
    name: '',
    type: 'runCommand',
    input: { command: '' },
    runAsUser: '',
    timeoutSeconds: undefined,
    ignoreStepFailure: false,
  });

  // Extract variables from template (e.g., {{SERVICE_NAME}})
  const extractVariables = (jobDocument: any): string[] => {
    const variables = new Set<string>();
    const regex = /\{\{([A-Z_]+)\}\}/g;

    const extractFromString = (str: string) => {
      let match;
      while ((match = regex.exec(str)) !== null) {
        variables.add(match[1]);
      }
    };

    const extractFromObject = (obj: any) => {
      if (typeof obj === 'string') {
        extractFromString(obj);
      } else if (Array.isArray(obj)) {
        obj.forEach(extractFromObject);
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(extractFromObject);
      }
    };

    extractFromObject(jobDocument);
    return Array.from(variables);
  };

  // Replace variables in template
  const replaceVariables = (jobDocument: any, variables: Record<string, string>): any => {
    const replaceInString = (str: string): string => {
      let result = str;
      Object.entries(variables).forEach(([key, value]) => {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      });
      return result;
    };

    const replaceInObject = (obj: any): any => {
      if (typeof obj === 'string') {
        return replaceInString(obj);
      } else if (Array.isArray(obj)) {
        return obj.map(replaceInObject);
      } else if (obj && typeof obj === 'object') {
        const result: any = {};
        Object.entries(obj).forEach(([key, value]) => {
          result[key] = replaceInObject(value);
        });
        return result;
      }
      return obj;
    };

    return replaceInObject(jobDocument);
  };

  useEffect(() => {
    if (!open) return;

    const fetchTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const response = await fetch(buildApiUrl('/api/v1/jobs/templates?active=true'));
        
        if (!response.ok) {
          throw new Error('Failed to fetch job templates');
        }
        
        const data = await response.json();
        setTemplates(data.templates || []);
      } catch (err) {
        console.error('Error fetching templates:', err);
        setError('Failed to load job templates');
      } finally {
        setLoadingTemplates(false);
      }
    };

    fetchTemplates();
    
    // Reset form when modal opens
    setTemplateId('');
    setExecuteTime('now');
    setScheduledFor('');
    setError('');
    setTemplateVariables({});
    setRequiredVariables([]);
  }, [open]);

  // When template changes, extract variables
  useEffect(() => {
    if (!templateId) {
      setRequiredVariables([]);
      setTemplateVariables({});
      return;
    }

    const selectedTemplate = templates.find((t) => t.id === parseInt(templateId));
    if (selectedTemplate?.job_document) {
      const vars = extractVariables(selectedTemplate.job_document);
      setRequiredVariables(vars);
      // Initialize with empty strings
      const initialVars: Record<string, string> = {};
      vars.forEach(v => initialVars[v] = '');
      setTemplateVariables(initialVars);
    }
  }, [templateId, templates]);

  // Load steps from selected template
  useEffect(() => {
    if (templateId) {
      const selectedTemplate = templates.find((t) => t.id === parseInt(templateId));
      if (selectedTemplate?.job_document?.steps) {
        setCustomSteps([...selectedTemplate.job_document.steps]);
        setShowStepsEditor(true);
      } else {
        setCustomSteps([]);
        setShowStepsEditor(false);
      }
    } else {
      setCustomSteps([]);
      setShowStepsEditor(false);
    }
  }, [templateId, templates]);

  const handleAddStep = () => {
    setCustomSteps([...customSteps, stepForm]);
    resetStepForm();
  };

  const handleUpdateStep = (index: number) => {
    const updated = [...customSteps];
    updated[index] = stepForm;
    setCustomSteps(updated);
    setEditingStepIndex(null);
    resetStepForm();
  };

  const handleDeleteStep = (index: number) => {
    setCustomSteps(customSteps.filter((_, i) => i !== index));
  };

  const handleEditStep = (index: number) => {
    setEditingStepIndex(index);
    setStepForm({ ...customSteps[index] });
  };

  const resetStepForm = () => {
    setStepForm({
      name: '',
      type: 'runCommand',
      input: { command: '' },
      runAsUser: '',
      timeoutSeconds: undefined,
      ignoreStepFailure: false,
    });
    setEditingStepIndex(null);
  };

  const handleSave = async () => {
    if (!templateId) {
      setError('Please select a job template');
      return;
    }

    if (executeTime === 'schedule' && !scheduledFor) {
      setError('Please select a scheduled time');
      return;
    }

    // Validate required variables
    const missingVars = requiredVariables.filter(v => !templateVariables[v] || templateVariables[v].trim() === '');
    if (missingVars.length > 0) {
      setError(`Please provide values for: ${missingVars.join(', ')}`);
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Find the selected template
      const selectedTemplate = templates.find((t) => t.id === parseInt(templateId));
      if (!selectedTemplate) {
        throw new Error('Selected template not found');
      }

      // Build the job document with custom steps
      let jobDocument = {
        ...selectedTemplate.job_document,
        steps: customSteps.length > 0 ? customSteps : selectedTemplate.job_document?.steps || []
      };

      // Replace variables in job document
      if (requiredVariables.length > 0) {
        jobDocument = replaceVariables(jobDocument, templateVariables);
      }

      // Prepare schedule data with proper ISO timestamp
      const scheduleData = executeTime === 'schedule' && scheduledFor 
        ? { scheduled_at: new Date(scheduledFor).toISOString() }
        : undefined;

      const response = await fetch(buildApiUrl('/api/v1/jobs/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_name: selectedTemplate.name,
          template_id: parseInt(templateId),
          job_document: jobDocument,
          target_type: 'device',
          target_devices: [deviceUuid],
          execution_type: executeTime === 'schedule' ? 'scheduled' : 'oneTime',
          schedule: scheduleData,
          created_by: 'dashboard-user',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create job');
      }

      onJobAdded();
      onClose();
    } catch (err) {
      console.error('Error creating job:', err);
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Job</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Job Template Selector */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Job Template *
            </label>
            {loadingTemplates ? (
              <div className="text-sm text-muted-foreground">Loading templates...</div>
            ) : (
              <select
                className="w-full border border-input bg-background rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                disabled={saving}
              >
                <option value="">Select a template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} {template.description && `— ${template.description}`}
                  </option>
                ))}
              </select>
            )}
         
          </div>

          {/* Template Variables */}
          {requiredVariables.length > 0 && (
            <div className="border border-border bg-accent rounded-md p-4">
           
          
              <div className="space-y-3">
                {requiredVariables.map((varName) => (
                  <div key={varName}>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      {varName.replace(/_/g, ' ')} <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                      value={templateVariables[varName] || ''}
                      onChange={(e) => setTemplateVariables({
                        ...templateVariables,
                        [varName]: e.target.value
                      })}
                      placeholder={`Enter ${varName.toLowerCase().replace(/_/g, ' ')}`}
                      disabled={saving}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution Time */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Execution Time *
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="executeTime"
                  value="now"
                  checked={executeTime === 'now'}
                  onChange={() => setExecuteTime('now')}
                  disabled={saving}
                  className="text-primary focus:ring-ring"
                />
                <span className="text-sm text-foreground">Execute Now</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="executeTime"
                  value="schedule"
                  checked={executeTime === 'schedule'}
                  onChange={() => setExecuteTime('schedule')}
                  disabled={saving}
                  className="text-primary focus:ring-ring"
                />
                <span className="text-sm text-foreground">Schedule</span>
              </label>
            </div>
            {executeTime === 'schedule' && (
              <input
                type="datetime-local"
                className="mt-3 w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                disabled={saving}
                min={new Date().toISOString().slice(0, 16)}
              />
            )}
          </div>

          {/* Job Steps Editor */}
          {showStepsEditor && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-foreground">
                  Job Steps ({customSteps.length})
                </label>
               
              </div>

              {/* Steps List */}
              {customSteps.length > 0 && (
                <div className="space-y-2 mb-3">
                  {customSteps.map((step, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 p-3 bg-accent border border-border rounded-lg"
                    >
                      <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h5 className="text-sm font-semibold text-foreground">{step.name}</h5>
                          <Badge variant="outline" className="text-xs">
                            {step.type}
                          </Badge>
                        </div>
                        {step.type === 'runCommand' && step.input.command && (
                          <p className="text-xs font-mono bg-muted text-muted-foreground px-2 py-1 rounded">
                            {step.input.command}
                          </p>
                        )}
                        {step.type === 'runHandler' && step.input.handler && (
                          <p className="text-xs text-muted-foreground">
                            Handler: <span className="font-mono">{step.input.handler}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditStep(index)}
                          disabled={saving || editingStepIndex !== null}
                          className="text-xs h-6 px-2"
                        >
                          Edit
                        </Button>
                        
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteStep(index)}
                          disabled={saving || editingStepIndex !== null}
                          className="text-xs h-6 px-2 text-destructive hover:text-destructive/90"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Step Editor Form */}
              {editingStepIndex !== null && (
                <div className="border border-border rounded-lg p-4 bg-accent space-y-3">
                  <h4 className="text-sm font-semibold text-foreground">
                    {editingStepIndex === -1 ? 'Add New Step' : `Edit Step ${editingStepIndex + 1}`}
                  </h4>

                  {/* Step Name */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Step Name *
                    </label>
                    <input
                      type="text"
                      className="w-full border border-input bg-background text-foreground rounded-md px-2 py-1 text-sm"
                      value={stepForm.name}
                      onChange={(e) => setStepForm({ ...stepForm, name: e.target.value })}
                      placeholder="e.g., Restart Service"
                    />
                  </div>

                  {/* Step Type */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Step Type *
                    </label>
                    <select
                      className="w-full border border-input bg-background text-foreground rounded-md px-2 py-1 text-sm"
                      value={stepForm.type}
                      onChange={(e) => {
                        const newType = e.target.value as 'runCommand' | 'runHandler';
                        setStepForm({
                          ...stepForm,
                          type: newType,
                          input: newType === 'runCommand' ? { command: '' } : { handler: '', args: [] }
                        });
                      }}
                    >
                      <option value="runCommand">Run Command</option>
                      <option value="runHandler">Run Handler</option>
                    </select>
                  </div>

                  {/* Command Input (for runCommand) */}
                  {stepForm.type === 'runCommand' && (
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Command *
                      </label>
                      <input
                        type="text"
                        className="w-full border border-input bg-background text-foreground rounded-md px-2 py-1 text-sm font-mono"
                        value={stepForm.input.command || ''}
                        onChange={(e) => setStepForm({
                          ...stepForm,
                          input: { ...stepForm.input, command: e.target.value }
                        })}
                        placeholder="e.g., systemctl,restart,nginx"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Use comma-separated format: command,arg1,arg2
                      </p>
                    </div>
                  )}

                  {/* Handler Input (for runHandler) */}
                  {stepForm.type === 'runHandler' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Handler Name *
                        </label>
                        <input
                          type="text"
                          className="w-full border border-input bg-background text-foreground rounded-md px-2 py-1 text-sm font-mono"
                          value={stepForm.input.handler || ''}
                          onChange={(e) => setStepForm({
                            ...stepForm,
                            input: { ...stepForm.input, handler: e.target.value }
                          })}
                          placeholder="e.g., install-package.sh"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Arguments (one per line)
                        </label>
                        <textarea
                          className="w-full border border-input bg-background text-foreground rounded-md px-2 py-1 text-sm font-mono"
                          rows={3}
                          value={(stepForm.input.args || []).join('\n')}
                          onChange={(e) => setStepForm({
                            ...stepForm,
                            input: {
                              ...stepForm.input,
                              args: e.target.value.split('\n').filter(line => line.trim())
                            }
                          })}
                          placeholder="arg1&#10;arg2&#10;arg3"
                        />
                      </div>
                    </>
                  )}

                  {/* Advanced Options */}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-foreground font-medium">
                      Advanced Options
                    </summary>
                    <div className="mt-2 space-y-2 pl-2">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Run As User
                        </label>
                        <input
                          type="text"
                          className="w-full border border-input bg-background text-foreground rounded-md px-2 py-1 text-sm"
                          value={stepForm.runAsUser || ''}
                          onChange={(e) => setStepForm({ ...stepForm, runAsUser: e.target.value })}
                          placeholder="e.g., root"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Timeout (seconds)
                        </label>
                        <input
                          type="number"
                          className="w-full border border-input bg-background text-foreground rounded-md px-2 py-1 text-sm"
                          value={stepForm.timeoutSeconds || ''}
                          onChange={(e) => setStepForm({
                            ...stepForm,
                            timeoutSeconds: e.target.value ? parseInt(e.target.value) : undefined
                          })}
                          placeholder="e.g., 300"
                        />
                      </div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={stepForm.ignoreStepFailure || false}
                          onChange={(e) => setStepForm({
                            ...stepForm,
                            ignoreStepFailure: e.target.checked
                          })}
                        />
                        <span className="text-xs text-foreground">Ignore step failure (continue on error)</span>
                      </label>
                    </div>
                  </details>

                  {/* Step Editor Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={resetStepForm}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (!stepForm.name || 
                            (stepForm.type === 'runCommand' && !stepForm.input.command) ||
                            (stepForm.type === 'runHandler' && !stepForm.input.handler)) {
                          alert('Please fill in all required fields');
                          return;
                        }
                        if (editingStepIndex === -1) {
                          handleAddStep();
                        } else {
                          handleUpdateStep(editingStepIndex);
                        }
                      }}
                      className="text-xs"
                    >
                      {editingStepIndex === -1 ? 'Add Step' : 'Update Step'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>

          <Button 
          
            onClick={handleSave} 
            disabled={saving || !templateId || loadingTemplates}
          >
            {saving ? 'Creating...' : 'Create Job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddJobModal;
