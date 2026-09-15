'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  TextField,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Tooltip,
} from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckIcon from '@mui/icons-material/Check';
import { MessageTemplate, TemplateService } from '@/lib/api';

interface TemplateManagerProps {
  onSelectTemplate: (content: string) => void;
}

export default function TemplateManager({ onSelectTemplate }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<string>('General');
  const [content, setContent] = useState<string>('');

  const fetchTemplates = async () => {
    try {
      const res = await TemplateService.list();
      setTemplates(res.data);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || !content.trim()) {
      alert('Template Name and Content are required.');
      return;
    }
    try {
      await TemplateService.create({
        name: name.trim(),
        category: category.trim() || 'General',
        content: content.trim(),
      });
      setOpenDialog(false);
      setName('');
      setContent('');
      fetchTemplates();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save template');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await TemplateService.delete(id);
      fetchTemplates();
    } catch (err) {
      alert('Delete failed');
    }
  };

  const insertTag = (tag: string) => {
    setContent(content + tag);
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <DescriptionIcon color="primary" /> Message Template Library
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Save and reuse pre-written templates with dynamic tags.
            </Typography>
          </Box>
          <Button
            size="small"
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => setOpenDialog(true)}
            sx={{ fontWeight: 700 }}
          >
            New Template
          </Button>
        </Stack>

        {templates.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
            No templates saved yet. Click "New Template" to add one.
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {templates.map((t) => (
              <Box
                key={t.id}
                sx={{
                  p: 1.5,
                  border: '1px solid #e2e8f0',
                  borderRadius: 2,
                  bgcolor: '#ffffff',
                  '&:hover': { bgcolor: '#f8fafc' },
                }}
              >
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {t.name}
                    </Typography>
                    <Chip label={t.category} size="small" sx={{ mt: 0.5, fontSize: '0.7rem' }} />
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="secondary"
                      startIcon={<CheckIcon />}
                      onClick={() => onSelectTemplate(t.content)}
                      sx={{ fontSize: '0.78rem', py: 0.2 }}
                    >
                      Use
                    </Button>
                    <Tooltip title="Delete template">
                      <IconButton size="small" color="error" onClick={() => handleDelete(t.id)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    bgcolor: '#f8fafc',
                    p: 1,
                    borderRadius: 1,
                    fontSize: '0.82rem',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {t.content}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}

        {/* Create Template Dialog */}
        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>Create Message Template</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Template Name *"
                fullWidth
                size="small"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                label="Category (e.g. Offers, Notification, Support)"
                fullWidth
                size="small"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.8 }}>
                  Insert Tag:
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Chip
                    label="{name} (Contact Name)"
                    size="small"
                    clickable
                    color="secondary"
                    variant="outlined"
                    onClick={() => insertTag('{name}')}
                  />
                  <Chip
                    label="{phone} (Phone Number)"
                    size="small"
                    clickable
                    color="secondary"
                    variant="outlined"
                    onClick={() => insertTag('{phone}')}
                  />
                </Stack>
              </Box>
              <TextField
                label="Message Body *"
                fullWidth
                multiline
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Hello {name}! We have an exciting update..."
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button variant="contained" color="primary" onClick={handleCreate}>
              Save Template
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
