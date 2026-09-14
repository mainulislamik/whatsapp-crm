'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  TextField,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Tooltip,
} from '@mui/material';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { Template, TemplateService } from '@/lib/api';

interface TemplateManagerProps {
  onSelectTemplate?: (content: string) => void;
}

export default function TemplateManager({ onSelectTemplate }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [open, setOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [category, setCategory] = useState<string>('General');

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
    if (!name.trim() || !content.trim()) return;
    try {
      await TemplateService.create({ name, content, category });
      setOpen(false);
      setName('');
      setContent('');
      fetchTemplates();
    } catch (err: any) {
      alert(err.message || 'Failed to create template');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('আপনি কি এই টেমপ্লেট মুছে ফেলতে চান?')) return;
    try {
      await TemplateService.delete(id);
      fetchTemplates();
    } catch (err) {
      alert('Delete failed');
    }
  };

  const insertVariable = (variable: string) => {
    setContent((prev) => prev + variable);
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              মেসেজ টেমপ্লেট ({templates.length})
            </Typography>
            <Typography variant="body2" color="text.secondary">
              বারবার ব্যবহার করা মেসেজগুলো টেমপ্লেট হিসেবে সংরক্ষণ করে রাখুন।
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<BookmarkAddIcon />}
            onClick={() => setOpen(true)}
          >
            নতুন টেমপ্লেট
          </Button>
        </Stack>

        <Grid container spacing={2}>
          {templates.length === 0 ? (
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                কোনো টেমপ্লেট তৈরি করা হয়নি।
              </Typography>
            </Grid>
          ) : (
            templates.map((t) => (
              <Grid item xs={12} sm={6} md={4} key={t.id}>
                <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {t.name}
                      </Typography>
                      <Chip label={t.category} size="small" variant="outlined" />
                    </Stack>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        whiteSpace: 'pre-wrap',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        mb: 1.5,
                      }}
                    >
                      {t.content}
                    </Typography>
                  </CardContent>
                  <Box sx={{ p: 1.5, pt: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {onSelectTemplate && (
                      <Button
                        size="small"
                        startIcon={<ContentCopyIcon fontSize="small" />}
                        onClick={() => onSelectTemplate(t.content)}
                      >
                        ব্যবহার করুন
                      </Button>
                    )}
                    <Tooltip title="মুছে ফেলুন">
                      <IconButton size="small" color="error" onClick={() => handleDelete(t.id)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Card>
              </Grid>
            ))
          )}
        </Grid>

        {/* Create Dialog */}
        <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>নতুন মেসেজ টেমপ্লেট তৈরি করুন</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="টেমপ্লেট নাম *"
                fullWidth
                size="small"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                label="ক্যাটাগরি"
                fullWidth
                size="small"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                  ডায়নামিক ট্যাগ যোগ করতে ক্লিক করুন:
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Chip
                    label="{name} (নাম)"
                    size="small"
                    onClick={() => insertVariable('{name}')}
                    clickable
                    color="primary"
                    variant="outlined"
                  />
                  <Chip
                    label="{phone} (ফোন নম্বর)"
                    size="small"
                    onClick={() => insertVariable('{phone}')}
                    clickable
                    color="primary"
                    variant="outlined"
                  />
                </Stack>
              </Box>
              <TextField
                label="মেসেজ কন্টেন্ট *"
                fullWidth
                multiline
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="আসসালামু আলাইকুম {name} ভাই..."
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>বাতিল</Button>
            <Button variant="contained" onClick={handleCreate}>সংরক্ষণ করুন</Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
