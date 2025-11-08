import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import { buildApiUrl } from '@/config/api';

interface AddTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface JobStep {
  name: string;
  type: string;
  input: {
    command: string;
    [key: string]: any;
  };
  runAsUser?: string;
  timeoutSeconds?: number;
}

interface TemplateVariable {
  name: string;
  description: string;
  defaultValue?: string;
}

export const AddTemplateModal: React.FC<AddTemplateModalProps> = ({ open, onClose, onSaved }) => {
  const [templateName, setTemplateName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('system');
  const [version, setVersion] = useState('1.0');
  const [includeStdOut, setIncludeStdOut] = useState(true);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [steps, setSteps] = useState<JobStep[]>([
    {
      name: '',
      type: 'runCommand',
      input: { command: '' },
      timeoutSeconds: 300,
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Extract variables from all step commands
  const extractVariablesFromSteps = (): string[] => {
    const regex = /\{\{([A-Z_]+)\}\}/g;
    const foundVars = new Set<string>();
    
    steps.forEach(step => {
      let match;
      while ((match = regex.exec(step.input.command)) !== null) {
        foundVars.add(match[1]);
      }
    });
    
    return Array.from(foundVars);
  };

  const handleAddVariable = () => {
    setVariables([...variables, { name: '', description: '' }]);
  };

  const handleRemoveVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index));
  };

  const handleVariableChange = (index: number, field: keyof TemplateVariable, value: string) => {
    const newVariables = [...variables];
    newVariables[index][field] = value;
    setVariables(newVariables);
  };

  const handleAutoDetectVariables = () => {
    const detectedVars = extractVariablesFromSteps();
    const existingVarNames = new Set(variables.map(v => v.name));
    
    // Add only new variables
    const newVars = detectedVars
      .filter(varName => !existingVarNames.has(varName))
      .map(varName => ({
        name: varName,
        description: '',
        defaultValue: ''
      }));
    
    if (newVars.length > 0) {
      setVariables([...variables, ...newVars]);
    }
  };

  const handleAddStep = () => {
    setSteps([
      ...steps,
      {
        name: '',
        type: 'runCommand',
        input: { command: '' },
        timeoutSeconds: 300,
      },
    ]);
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length > 1) {
      setSteps(steps.filter((_, i) => i !== index));
    }
  };

  const handleStepChange = (index: number, field: string, value: any) => {
    const newSteps = [...steps];
    if (field === 'command') {
      newSteps[index].input.command = value;
    } else if (field === 'name' || field === 'type') {
      newSteps[index][field] = value;
    } else if (field === 'timeoutSeconds') {
      newSteps[index].timeoutSeconds = value ? parseInt(value) : undefined;
    } else if (field === 'runAsUser') {
      newSteps[index].runAsUser = value || undefined;
    }
    setSteps(newSteps);
  };

  const handleSave = async () => {
    setError(null);

    // Validation
    if (!templateName.trim()) {
      setError('Template name is required');
      return;
    }

    if (steps.some(step => !step.name.trim() || !step.input.command.trim())) {
      setError('All steps must have a name and command');
      return;
    }

    setSaving(true);

    try {
      const jobDocument = {
        version,
        includeStdOut,
        ...(variables.length > 0 && {
          variables: variables.reduce((acc, v) => {
            if (v.name) {
              acc[v.name] = {
                description: v.description || undefined,
                defaultValue: v.defaultValue || undefined
              };
            }
            return acc;
          }, {} as Record<string, any>)
        }),
        steps: steps.map(step => ({
          name: step.name,
          type: step.type,
          input: step.input,
          ...(step.runAsUser && { runAsUser: step.runAsUser }),
          ...(step.timeoutSeconds && { timeoutSeconds: step.timeoutSeconds }),
        })),
      };

      const response = await fetch(buildApiUrl('/api/v1/jobs/templates'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: templateName,
          description: description || null,
          category,
          job_document: jobDocument,
          created_by: 'dashboard-user',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 409) {
          throw new Error('A template with this name already exists');
        }
        throw new Error(errorData.error || 'Failed to save template');
      }

      // Reset form
      setTemplateName('');
      setDescription('');
      setCategory('system');
      setVersion('1.0');
      setIncludeStdOut(true);
      setVariables([]);
      setSteps([
        {
          name: '',
          type: 'runCommand',
          input: { command: '' },
          timeoutSeconds: 300,
        },
      ]);

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Job Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Template Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Template Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., System Health Check"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Category <span className="text-destructive">*</span>
                </label>
                <select
                  className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="system">System</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="monitoring">Monitoring</option>
                  <option value="deployment">Deployment</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Version</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="1.0"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Description</label>
              <textarea
                className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this template does..."
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="includeStdOut"
                checked={includeStdOut}
                onChange={(e) => setIncludeStdOut(e.target.checked)}
                className="w-4 h-4 text-primary border-input rounded focus:ring-ring"
              />
              <label htmlFor="includeStdOut" className="text-sm text-foreground">
                Include stdout/stderr in job output
              </label>
            </div>
          </div>

          {/* Template Variables */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Template Variables</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Define parameters users must provide (e.g., SERVICE_NAME, PORT)
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleAutoDetectVariables}
                  type="button"
                >
                  Auto-Detect
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleAddVariable}
                  type="button"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Variable
                </Button>
              </div>
            </div>

            {variables.length > 0 ? (
              <div className="space-y-3">
                {variables.map((variable, index) => (
                  <div key={index} className="bg-accent border border-border rounded-lg p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            Variable Name (use UPPER_CASE) <span className="text-destructive">*</span>
                          </label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 text-sm font-mono border border-input bg-background text-foreground rounded focus:outline-none focus:ring-1 focus:ring-ring"
                            value={variable.name}
                            onChange={(e) => handleVariableChange(index, 'name', e.target.value.toUpperCase())}
                            placeholder="e.g., SERVICE_NAME"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Use in commands as: <code className="bg-muted px-1 rounded">{'{{' + (variable.name || 'VARIABLE_NAME') + '}}'}</code>
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            Description
                          </label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 text-sm border border-input bg-background text-foreground rounded focus:outline-none focus:ring-1 focus:ring-ring"
                            value={variable.description}
                            onChange={(e) => handleVariableChange(index, 'description', e.target.value)}
                            placeholder="e.g., Name of the service to restart"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            Default Value (optional)
                          </label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 text-sm border border-input bg-background text-foreground rounded focus:outline-none focus:ring-1 focus:ring-ring"
                            value={variable.defaultValue || ''}
                            onChange={(e) => handleVariableChange(index, 'defaultValue', e.target.value)}
                            placeholder="e.g., nginx"
                          />
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveVariable(index)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive/90"
                        type="button"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-accent border border-border rounded p-4 text-center text-sm text-muted-foreground">
                No variables defined. Use {'{{VARIABLE_NAME}}'} in commands and click "Auto-Detect" or "Add Variable".
              </div>
            )}
          </div>

          {/* Job Steps */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Job Steps</h3>
              <Button variant="outline" size="sm" onClick={handleAddStep}>
                <Plus className="w-4 h-4 mr-1" />
                Add Step
              </Button>
            </div>

            <div className="space-y-4">
              {steps.map((step, index) => (
                <div key={index} className="bg-accent border border-border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    {/* Step Number */}
                    <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-semibold">
                      {index + 1}
                    </div>

                    {/* Step Form */}
                    <div className="flex-1 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            Step Name <span className="text-destructive">*</span>
                          </label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 text-sm border border-input bg-background text-foreground rounded focus:outline-none focus:ring-1 focus:ring-ring"
                            value={step.name}
                            onChange={(e) => handleStepChange(index, 'name', e.target.value)}
                            placeholder="e.g., Check Disk Space"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            Step Type
                          </label>
                          <select
                            className="w-full px-2 py-1.5 text-sm border border-input bg-background text-foreground rounded focus:outline-none focus:ring-1 focus:ring-ring"
                            value={step.type}
                            onChange={(e) => handleStepChange(index, 'type', e.target.value)}
                          >
                            <option value="runCommand">runCommand</option>
                            <option value="shell">shell</option>
                            <option value="script">script</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Command <span className="text-destructive">*</span>
                        </label>
                        <textarea
                          className="w-full px-2 py-1.5 text-sm font-mono border border-input bg-background text-foreground rounded focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]"
                          value={step.input.command}
                          onChange={(e) => handleStepChange(index, 'command', e.target.value)}
                          placeholder="e.g., df -h"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            Run As User (optional)
                          </label>
                          <input
                            type="text"
                            className="w-full px-2 py-1.5 text-sm border border-input bg-background text-foreground rounded focus:outline-none focus:ring-1 focus:ring-ring"
                            value={step.runAsUser || ''}
                            onChange={(e) => handleStepChange(index, 'runAsUser', e.target.value)}
                            placeholder="root"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            Timeout (seconds)
                          </label>
                          <input
                            type="number"
                            className="w-full px-2 py-1.5 text-sm border border-input bg-background text-foreground rounded focus:outline-none focus:ring-1 focus:ring-ring"
                            value={step.timeoutSeconds || ''}
                            onChange={(e) => handleStepChange(index, 'timeoutSeconds', e.target.value)}
                            placeholder="300"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Remove Button */}
                    {steps.length > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveStep(index)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive/90"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>

          <Button 
          
            onClick={handleSave}  
            disabled={saving}
          >
            {saving ? 'Creating...' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
       
    </Dialog>
  );
};

export default AddTemplateModal;
