import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { buildApiUrl } from '@/config/api';

interface SaveTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  jobDocument?: any;
}

export const SaveTemplateModal: React.FC<SaveTemplateModalProps> = ({
  open,
  onClose,
  onSaved,
  jobDocument,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('custom');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }

    if (!jobDocument) {
      setError('No job document to save');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(buildApiUrl('/api/v1/jobs/templates'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          category,
          job_document: jobDocument,
          created_by: 'dashboard-user', // You can get this from auth context if available
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save template');
      }

      // Success!
      setName('');
      setDescription('');
      setCategory('custom');
      onClose();
      
      if (onSaved) {
        onSaved();
      }
    } catch (err) {
      console.error('Error saving template:', err);
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setCategory('custom');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Template Name */}
          <div className="space-y-2">
            <Label htmlFor="template-name">
              Template Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="template-name"
              placeholder="e.g., System Health Check"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="template-category">Category</Label>
            <Select value={category} onValueChange={setCategory} disabled={saving}>
              <SelectTrigger id="template-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="monitoring">Monitoring</SelectItem>
                <SelectItem value="deployment">Deployment</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="template-description">Description</Label>
            <Textarea
              id="template-description"
              placeholder="Describe what this template does..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              rows={4}
            />
          </div>

          {/* Job Document Preview */}
          {jobDocument && (
            <div className="space-y-2">
              <Label>Template Configuration</Label>
              <div className="bg-accent border border-border rounded p-3 text-xs">
                <div className="text-muted-foreground mb-1">
                  Version: {jobDocument.version || '1.0'}
                </div>
                <div className="text-muted-foreground">
                  Steps: {jobDocument.steps?.length || 0}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaveTemplateModal;
